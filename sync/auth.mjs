// auth.mjs - password hashing + cookie MAC.

import crypto from "node:crypto";
import argon2 from "argon2";

export const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTS);
}

export function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

// Opaque 32-byte hex session id; cookie carries id + HMAC(secret, id) so a stolen DB row
// without the secret cannot be replayed.
export function mintSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

export function signCookie(sessionId, secret) {
  const mac = crypto
    .createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${mac}`;
}

// Verify a cookie value, return the session id (or null). The MAC check is constant-time;
// we reject any length-mismatched or malformed cookie before touching timingSafeEqual.
export function verifyCookie(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot < 1 || dot === cookieValue.length - 1) return null;
  const id = cookieValue.slice(0, dot);
  const mac = cookieValue.slice(dot + 1);
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(mac)) return null;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(id)
    .digest("base64url");
  if (expected.length !== mac.length) return null;
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
  } catch {
    return null;
  }
  return ok ? id : null;
}

export const COOKIE_NAME = "hitab_sync";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export function buildSetCookie(value) {
  // Path is /api so static files served from / never receive the cookie (defence-in-depth).
  return [
    `${COOKIE_NAME}=${value}`,
    `Path=/api`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${SESSION_MAX_AGE_S}`,
  ].join("; ");
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
