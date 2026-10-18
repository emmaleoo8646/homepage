import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";

const login = JSON.parse(readFileSync(new URL("../../.env.ecs.login.json", import.meta.url), "utf8"));
const ip = process.argv[2];
if (ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error("Invalid ECS IP.");
function request(path, auth, secure = true) {
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request({
      hostname: "home.douwuyou.cn", port: secure ? 443 : 80,
      path, method: "GET", ...(auth ? { auth } : {}),
      ...(ip ? { lookup: (_name, options, callback) => options.all
        ? callback(null, [{ address: ip, family: 4 }])
        : callback(null, ip, 4) } : {}),
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(15000, () => req.destroy(new Error("Request timed out.")));
    req.on("error", reject);
    req.end();
  });
}
function check(condition, label) {
  if (!condition) throw new Error("FAILED: " + label);
  console.log("PASS: " + label);
}
const auth = `${login.username}:${login.password}`;
const redirect = await request("/", null, false);
check(redirect.status === 308 && redirect.headers.location === "https://home.douwuyou.cn/", "HTTP redirects to HTTPS");
const anonymous = await request("/");
check(anonymous.status === 401 && !anonymous.body.includes("你的个人起始页"), "Anonymous homepage access is blocked");
check((await request("/assets/night-city.jpg")).status === 401, "Anonymous wallpaper access is blocked");
check((await request("/", "home:deliberately-invalid-password")).status === 401, "Incorrect password is rejected");
const page = await request("/", auth);
check(page.status === 200 && page.body.includes("HiTab · 我的起始页"), "Authenticated homepage loads with valid TLS");
const script = page.body.match(/src="([^"]+\.js)"/);
check(Boolean(script), "Production JavaScript is present");
check((await request(script[1], auth)).status === 200, "Authenticated JavaScript loads");
check((await request("/assets/night-city.jpg", auth)).status === 200, "Authenticated wallpaper loads");
check((await request("/.env.ecs.login.json", auth)).status === 404, "Credential paths are not served");
check((await request("/vinext-client-entry-manifest.json", auth)).status === 404, "Build metadata is not served");

// --- sync service ---
// /api/healthz is fronted by the gateway and bypasses auth_basic.
const healthz = await request("/api/healthz");
check(healthz.status === 200 && healthz.body.trim() === "ok",
      "Anonymous /api/healthz returns ok");
// /api/sync/* sits behind the session, not behind auth_basic.
const anonSync = await request("/api/sync/whoami");
check(anonSync.status === 401, "Anonymous /api/sync/whoami is rejected");
// Regression: a misconfigured nginx that bolts auth_basic onto /api/sync/* would set
// this header. The dual stack (HTTP Basic + sync session) must stay split.
check(anonSync.headers["www-authenticate"] === undefined,
      "/api/sync/whoami does not advertise HTTP Basic");
