// app.mjs - Fastify factory wiring all routes and middleware.

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";

import { openDb, migrate, deleteExpiredSessions } from "./db.mjs";
import { authRoutes } from "./routes/auth.mjs";
import { stateRoutes } from "./routes/state.mjs";
import { healthRoutes } from "./routes/health.mjs";

const COOKIE_SECRET_HINT = "x-session-secret-for-cookie-mac-verification";

function parseCorsAllow(corsAllowEnv) {
  return corsAllowEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl
      const allow = parseCorsAllow(config.corsAllow);
      try {
        if (allow.includes(origin)) return cb(null, true);
        const url = new URL(origin);
        if (/\.(pages|workers)\.dev$/i.test(url.hostname)) return cb(null, true);
      } catch {
        // fall through
      }
      return cb(new Error("origin not allowed"), false);
    },
    credentials: true,
    allowedHeaders: ["content-type", "x-requested-with", "if-match", "authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  });

  await app.register(rateLimit, {
    global: false, // routes opt in via config.rateLimit
  });

  app.setErrorHandler((error, request, reply) => {
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
