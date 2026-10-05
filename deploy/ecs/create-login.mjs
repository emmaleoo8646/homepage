import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";

const loginFile = new URL("../../.env.ecs.login.json", import.meta.url);
const hashFile = new URL("../../.env.ecs.htpasswd", import.meta.url);
const login = existsSync(loginFile)
  ? JSON.parse(readFileSync(loginFile, "utf8"))
  : { username: "home", password: randomBytes(24).toString("base64url") };
if (login.username !== "home" || !/^[A-Za-z0-9_-]{32}$/.test(login.password)) {
  throw new Error("The existing local login file has an unexpected format.");
}
if (!existsSync(loginFile)) {
  writeFileSync(loginFile, JSON.stringify(login, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
chmodSync(loginFile, 0o600);
if (!existsSync(hashFile)) {
  const hash = spawnSync("openssl", ["passwd", "-6", "-stdin"], {
    input: login.password + "\n", encoding: "utf8",
  });
  if (hash.status !== 0 || !hash.stdout.startsWith("$6$")) {
    throw new Error("Unable to create the server password hash.");
  }
  writeFileSync(hashFile, login.username + ":" + hash.stdout.trim() + "\n", {
    mode: 0o600, flag: "wx",
  });
}
chmodSync(hashFile, 0o600);
console.log("Login files are ready locally; no credentials were printed.");
