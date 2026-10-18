import https from "node:https";
import http from "node:http";

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

const redirect = await request("/", null, false);
check(redirect.status === 308 && redirect.headers.location === "https://home.douwuyou.cn/", "HTTP redirects to HTTPS");
const page = await request("/");
check(page.status === 200 && page.body.includes("HiTab · 我的起始页"), "Anonymous homepage loads over HTTPS");
const script = page.body.match(/src="([^"]+\.js)"/);
check(Boolean(script), "Production JavaScript is present");
check((await request(script[1])).status === 200, "Anonymous JavaScript loads");
check((await request("/assets/night-city.jpg")).status === 200, "Anonymous wallpaper loads");
check((await request("/.env.ecs.login.json")).status === 404, "Credential paths are not served");
check((await request("/vinext-client-entry-manifest.json")).status === 404, "Build metadata is not served");

// --- sync service (unchanged: behind the Fastify session, not HTTP Basic) ---
const healthz = await request("/api/healthz");
check(healthz.status === 200 && healthz.body.trim() === "ok",
      "Anonymous /api/healthz returns ok");
const anonSync = await request("/api/sync/whoami");
check(anonSync.status === 401, "Anonymous /api/sync/whoami is rejected");
// Regression: keeps /api/sync/whoami out of any HTTP Basic flow.
check(anonSync.headers["www-authenticate"] === undefined,
      "/api/sync/whoami does not advertise HTTP Basic");
