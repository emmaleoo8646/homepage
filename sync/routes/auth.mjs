// routes/auth.mjs - register / login / logout / whoami.

import {
  COOKIE_NAME,
  SESSION_MAX_AGE_S,
  buildSetCookie,
  clearCookieHeader,
  hashPassword,
  mintSessionId,
  signCookie,
  verifyCookie,
  verifyPassword,
} from "../auth.mjs";
import {
  deleteSession,
  getSession,
  getUserByUsername,
  insertSession,
  insertUser,
  touchSession,
  getPayloadMeta,
} from "../db.mjs";
import { loginSchema, registerSchema } from "../schemas.mjs";

const SESSION_LIFE_MS = SESSION_MAX_AGE_S * 1000;

function formatUserAgent(req) {
  const raw = req.headers["user-agent"];
  return typeof raw === "string" ? raw.slice(0, 200) : null;
}

function lookupSession(db, sessionSecret, cookieValue) {
  const sid = verifyCookie(cookieValue, sessionSecret);
  if (!sid) return null;
  const session = getSession(db, sid);
  if (!session) return null;
  const expiresMs = Date.parse(
    session.expires_at.endsWith("Z") ? session.expires_at : `${session.expires_at}Z`,
  );
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    deleteSession(db, sid);
    return null;
  }
  touchSession(db, sid);
  return {
    sessionId: sid,
    userId: session.user_id,
    username: session.username,
  };
}

export async function authRoutes(app, { db, sessionSecret }) {
  // Decorate every incoming request with a currentUser derived from the hitab_sync cookie.
  app.addHook("preHandler", async (request) => {
    request.currentUser = lookupSession(
      db,
      sessionSecret,
      request.cookies?.[COOKIE_NAME],
    );
  });

  app.post(
    "/api/sync/register",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: parsed.error.issues[0].message, code: "invalid_input" });
      }
      const { username, password } = parsed.data;
      const normalised = username.toLowerCase();

      if (getUserByUsername(db, normalised)) {
        return reply
          .code(409)
          .send({ error: "用户名已被占用", code: "invalid_input" });
      }

      const passwordHash = await hashPassword(password);
      const userId = insertUser(db, normalised, passwordHash);

      const sid = mintSessionId();
      const expiresAt = new Date(Date.now() + SESSION_LIFE_MS).toISOString();
      insertSession(db, sid, userId, expiresAt, formatUserAgent(request));

      reply.header("Set-Cookie", buildSetCookie(signCookie(sid, sessionSecret)));
      return reply.code(201).send({ username: normalised });
    },
  );

  app.post(
    "/api/sync/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "用户名或密码格式错误", code: "invalid_input" });
      }
      const { username, password } = parsed.data;
      const normalised = username.toLowerCase();

      const user = getUserByUsername(db, normalised);
      if (!user) {
        return reply
          .code(401)
          .send({ error: "用户名或密码不正确", code: "unauthorized" });
      }
      const ok = await verifyPassword(user.password_hash, password);
      if (!ok) {
        return reply
          .code(401)
          .send({ error: "用户名或密码不正确", code: "unauthorized" });
      }

      const sid = mintSessionId();
      const expiresAt = new Date(Date.now() + SESSION_LIFE_MS).toISOString();
      insertSession(db, sid, user.id, expiresAt, formatUserAgent(request));

      reply.header("Set-Cookie", buildSetCookie(signCookie(sid, sessionSecret)));
      return reply.code(200).send({ username: normalised });
    },
  );

  app.post("/api/sync/logout", async (request, reply) => {
    const sid = verifyCookie(request.cookies?.[COOKIE_NAME], sessionSecret);
    if (sid) deleteSession(db, sid);
    reply.header("Set-Cookie", clearCookieHeader());
    return reply.code(204).send();
  });

  app.get("/api/sync/whoami", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "未登录", code: "unauthorized" });
    }
    const meta = getPayloadMeta(db, user.userId);
    return reply.code(200).send({
      username: user.username,
      hasPayload: Boolean(meta),
      updated_at: meta?.updated_at ?? null,
    });
  });
}
