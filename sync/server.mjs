// server.mjs - listen and wire graceful shutdown.

import { loadConfig, validateConfig } from "./config.mjs";
import { buildApp } from "./app.mjs";

const config = loadConfig();
validateConfig(config);

const { app } = await buildApp(config);

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, "shutdown error");
  }
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ port: config.port, host: config.host }, "hitab-sync listening");
} catch (err) {
  app.log.error({ err }, "failed to start");
  process.exit(1);
}
