// db.mjs - SQLite schema, migrations, and access helpers.
// All queries are sync (better-sqlite3 is intentionally synchronous; the per-request overhead
// is well below 1ms for the schema shapes we use).

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payloads (
      user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      blob           BLOB NOT NULL,
      updated_at     TEXT NOT NULL,
      device_id      TEXT NOT NULL DEFAULT '',
      schema_version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT NOT NULL,
      last_seen   TEXT NOT NULL DEFAULT (datetime('now')),
      user_agent  TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
}

// -- users --
export function getUserByUsername(db, username) {
  return db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username);
}

export function insertUser(db, username, passwordHash) {
  const info = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);
  return Number(info.lastInsertRowid);
}

// -- sessions --
export function insertSession(db, sid, userId, expiresAtIso, userAgent) {
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
  ).run(sid, userId, expiresAtIso, userAgent ?? null);
}

export function getSession(db, sid) {
  return db
    .prepare(
      `SELECT s.id, s.user_id, s.expires_at, u.username
         FROM sessions s
         JOIN users u ON s.user_id = u.id
        WHERE s.id = ?`,
    )
    .get(sid);
}

export function touchSession(db, sid) {
  db.prepare("UPDATE sessions SET last_seen = datetime('now') WHERE id = ?").run(sid);
}

export function deleteSession(db, sid) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sid);
}

export function deleteExpiredSessions(db) {
  return db
    .prepare("DELETE FROM sessions WHERE expires_at < datetime('now')")
    .run().changes;
}

// -- payloads --
export function getPayload(db, userId) {
  return db
    .prepare(
      "SELECT blob, updated_at, device_id, schema_version FROM payloads WHERE user_id = ?",
    )
    .get(userId);
}

export function getPayloadMeta(db, userId) {
  return db
    .prepare("SELECT updated_at FROM payloads WHERE user_id = ?")
    .get(userId);
}

export function upsertPayload(db, userId, blobBuf, updatedAt, deviceId, schemaVersion) {
  db.prepare(
    `INSERT INTO payloads (user_id, blob, updated_at, device_id, schema_version)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       blob = excluded.blob,
       updated_at = excluded.updated_at,
       device_id = excluded.device_id,
       schema_version = excluded.schema_version`,
  ).run(
    userId,
    blobBuf,
    updatedAt,
    (deviceId ?? "").slice(0, 64),
    schemaVersion,
  );
}

export function deletePayload(db, userId) {
  db.prepare("DELETE FROM payloads WHERE user_id = ?").run(userId);
}
