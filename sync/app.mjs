// app.mjs - Fastify factory wiring all routes and middleware.

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";

import { openDb, migrate, deleteExpiredSessions } from "./db.mjs";
import { authRoutes } from "./routes/auth.mjs";
import { stateRoutes } from "./routes/state.mjs";
import { healthRoutes } from "./routes/health.mjs";

const COOKIE_SECRET_HINT = "x-session-secret-for-cookie-mac-verification";
const CORS_ERROR_MESSAGE = "origin not allowed";

class CORSError extends Error {
  constructor(message, meta) {
    super(message);
    this.name = "CORSError";
    this.corsMeta = meta;
  }
}

function parseCorsAllow(corsAllowEnv) {
  return corsAllowEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, hostHeader, allowList) {
  if (!origin || !hostHeader) return false;
  // 1. Same-origin: Origin scheme+host+port must match the Host header we received
  //    (set by nginx via `proxy_set_header Host $host` and trusted via trustProxy).
  try {
    const url = new URL(origin);
    if (url.host.toLowerCase() === hostHeader.toLowerCase()) return true;
    if (/\.(pages|workers)\.dev$/i.test(url.hostname)) return true;
  } catch {
    // fall through to allowList
  }
  return allowList.includes(origin);
}

const CORS_ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS =
  "content-type, x-requested-with, if-match, authorization";

export async function buildApp(config) {
  const db = openDb(config.dbPath);
  migrate(db);

  const app = Fastify({
    logger:
      config.nodeEnv === "production"
        ? { level: config.logLevel, redact: ["req.headers.cookie", "req.headers.authorization"] }
        : { level: config.logLevel },
    bodyLimit: config.bodyLimit,
    trustProxy: true,
  });

  await app.register(cookie, {
    // The cookie plugin's parse decorator requires a secret for HMAC-signed cookies.
    // We don't actually use that feature (sessions are opaque ids + our own MAC),
    // but we pass a constant derived from SESSION_SECRET so an empty env still parses.
    secret: config.sessionSecret + COOKIE_SECRET_HINT,
  });

  // Custom CORS via onRequest hook. We can't use @fastify/cors 9 here because its
  // origin callback only receives (origin, cb) — it has no access to request.hostname,
  // which is required to distinguish same-origin requests from cross-origin ones.
  // Same-origin requests are auto-allowed; cross-origin is gated on allowList env +
  // *.pages.dev / *.workers.dev regex (for the Sites deployment to share this backend).
  const corsAllowList = parseCorsAllow(config.corsAllow);
  app.addHook("onRequest", (request, reply, done) => {
    const origin = request.headers.origin;
    if (!origin) {
      // No Origin header (e.g. curl, server-to-server) — proceed normally.
      return done();
    }

    const ok = isAllowedOrigin(origin, request.hostname, corsAllowList);
    if (ok) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
      reply.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
    }

    if (request.method === "OPTIONS") {
      // Preflight: respond directly, do not run the actual handler.
      reply.header("Access-Control-Max-Age", "86400");
      reply.code(ok ? 204 : 403).send();
      return;
    }

    if (!ok) {
      // Hand off to the error handler so the response shape is consistent.
      return done(
        new CORSError(CORS_ERROR_MESSAGE, {
          origin,
          host: request.hostname,
        }),
      );
    }

    return done();
  });

  await app.register(rateLimit, {
    global: false, // routes opt in via config.rateLimit
  });

  // Error contract: `{ error: string, code: string }` with codes
  //   invalid_input, unauthorized, forbidden, not_found, conflict,
  //   rate_limited, origin_not_allowed, internal.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CORSError || error.message === CORS_ERROR_MESSAGE) {
      request.log.warn(
        { origin: request.headers.origin, host: request.hostname },
        "cors rejected",
      );
      return reply
        .code(403)
        .send({ error: "该来源未授权访问同步服务", code: "origin_not_allowed" });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.message || "请求失败",
        code: error.code || "invalid_input",
      });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({ error: "服务器内部错误", code: "internal" });
  });

  await healthRoutes(app);
  await authRoutes(app, { db, sessionSecret: config.sessionSecret });
  await stateRoutes(app, { db });

  // Periodic expired-session cleanup. Stops on close.
  const cleanupInterval = setInterval(() => {
    try {
      const removed = deleteExpiredSessions(db);
      if (removed > 0) app.log.info({ removed }, "pruned expired sessions");
    } catch (err) {
      app.log.warn({ err }, "session cleanup failed");
    }
  }, 60 * 60 * 1000);
  app.addHook("onClose", async () => clearInterval(cleanupInterval));

  return { app, db };
}
