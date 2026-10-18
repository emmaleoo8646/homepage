// build.mjs - stamps a build ID. Pure no-op at runtime but the multi-stage Dockerfile runs it
// so the build layer has evidence that source is wired in.
import { writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const stamp =
  process.env.BUILD_ID ||
  crypto
    .createHash("sha1")
    .update(`${Date.now()}-${crypto.randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 12);

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(here, "build-id.txt"), `${stamp}\n`);
console.log(`build-id: ${stamp}`);
