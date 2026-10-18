// config.mjs - read the process environment.

export function loadConfig() {
  return {
    host: process.env.HOST ?? "::",
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? "/data/sync.sqlite",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    nodeEnv: process.env.NODE_ENV ?? "development",
    logLevel: process.env.LOG_LEVEL ?? "info",
    corsAllow: process.env.SYNC_CORS_ALLOW ?? "",
    bodyLimit: Number(process.env.BODY_LIMIT ?? 5 * 1024 * 1024),
  };
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) {
    errors.push("SESSION_SECRET is missing or too short (need >= 32 chars)");
  }
  if (!cfg.dbPath) errors.push("DB_PATH is empty");
  if (errors.length) throw new Error(`Invalid sync config: ${errors.join("; ")}`);
}
