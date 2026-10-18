// verify-sync.mjs - end-to-end smoke test for the hitab-sync API.
// Run after a fresh deploy: `node deploy/ecs/verify-sync.mjs`.
// Uses only public surface — no shared state with verify.mjs.

const BASE = process.env.SYNC_BASE ?? "https://home.douwuyou.cn";

function check(cond, label) {
  if (!cond) {
    console.log("FAIL:", label);
    process.exit(1);
  } else {
    console.log("PASS:", label);
  }
}

class Jar {
  constructor() { this.jar = new Map(); }
  ingest(res) {
    const headers = res.headers;
    const setCookie =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : null;
    if (setCookie) {
      for (const line of setCookie) this.#ingestOne(line);
      return;
    }
    const raw = headers.get("set-cookie");
    if (raw) {
      // node 18 fallback: headers.raw not present
      this.#ingestOne(raw);
    }
  }
  #ingestOne(line) {
    const [pair] = String(line).split(";");
    const eq = pair.indexOf("=");
    if (eq < 1) return;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (!v) this.jar.delete(k);
    else this.jar.set(k, v);
  }
  header() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function hit(method, path, { body, headers = {}, jar } = {}) {
  const url = /^https?:/.test(path) ? path : `${BASE}${path}`;
  const reqHeaders = {
    "x-requested-with": "fetch",
    accept: "application/json",
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...headers,
  };
  if (jar) reqHeaders.cookie = jar.header();
  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (jar) jar.ingest(res);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, headers: res.headers, text, body: parsed };
}

function uniqueUsername() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const username = uniqueUsername();
const password = "verify-sync-pwd-1";

const jar = new Jar();

// 1. anonymous whoami -> 401
{
  const r = await hit("GET", "/api/sync/whoami", { jar });
  check(r.status === 401 && r.body && r.body.code === "unauthorized",
    "Anonymous whoami returns 401 unauthorized");
}

// 2. register -> 201, sets cookie
{
  const r = await hit("POST", "/api/sync/register", { body: { username, password }, jar });
  check(r.status === 201, `Register returns 201 (got ${r.status} ${r.text})`);
  check(r.body && r.body.username === username, "Register response includes username");
  check(jar.jar.has("hitab_sync"), "Register sets hitab_sync cookie");
}

// 3. whoami with cookie -> 200, no payload yet
{
  const r = await hit("GET", "/api/sync/whoami", { jar });
  check(r.status === 200, `Whoami (signed in) returns 200 (got ${r.status})`);
  check(r.body && r.body.username === username && r.body.hasPayload === false,
    "Whoami reports signed-in user with no payload");
}

// 4. PUT state without If-Match -> 428 or 412 (server demands It-Match)
{
  const r = await hit("PUT", "/api/sync/state", {
    body: { blob: { hello: "world" }, schema_version: 1 },
    jar,
  });
  check(r.status === 412 || r.status === 428,
    `PUT without If-Match is rejected (got ${r.status})`);
}

// 5. PUT state with If-Match: * -> 200, returns updated_at
let firstStamp;
{
  const r = await hit("PUT", "/api/sync/state", {
    body: {
      blob: {
        version: 1,
        bookmarks: [],
        todos: [],
        note: "verify-sync payload",
        settings: {
          engine: "baidu",
          wallpaper: "night-city",
          color: "#18324a",
          overlay: 30,
          theme: "light",
          showTime: false,
          showWidgets: true,
          showQuote: true,
        },
        quoteIndex: 0,
      },
      schema_version: 1,
      device_id: "verify-sync",
    },
    headers: { "if-match": "*" },
    jar,
  });
  check(r.status === 200 && typeof r.body.updated_at === "string",
    `First PUT with If-Match: * returns 200 with updated_at (got ${r.status} ${r.text})`);
  firstStamp = r.body && r.body.updated_at;
}

// 6. GET state round-trips
{
  const r = await hit("GET", "/api/sync/state", { jar });
  check(r.status === 200 && r.body.note === "verify-sync payload" &&
    r.body.updated_at === firstStamp,
    "GET state returns the payload we just wrote");
}

// 7. PUT state with stale If-Match -> 412
{
  const stale = new Date(Date.now() - 60_000).toISOString();
  const r = await hit("PUT", "/api/sync/state", {
    body: { blob: { ok: true }, schema_version: 1 },
    headers: { "if-match": stale },
    jar,
  });
  check(r.status === 412, `Stale If-Match returns 412 (got ${r.status})`);
}

// 8. PUT state with current If-Match -> 200 with newer updated_at
{
  const r = await hit("PUT", "/api/sync/state", {
    body: { blob: { ok: 2 }, schema_version: 1 },
    headers: { "if-match": firstStamp },
    jar,
  });
  check(r.status === 200 && r.body.updated_at !== firstStamp,
    "Current If-Match accepts and produces a newer updated_at");
  firstStamp = r.body.updated_at;
}

// 9. logout -> 204, cookie cleared
{
  const r = await hit("POST", "/api/sync/logout", { jar });
  check(r.status === 204, "Logout returns 204");
}
// 10. whoami after logout -> 401
{
  const r = await hit("GET", "/api/sync/whoami", { jar });
  check(r.status === 401, "Whoami after logout returns 401");
}

// 11. duplicate register -> 409
{
  const r = await hit("POST", "/api/sync/register", {
    body: { username, password },
    jar: new Jar(),
  });
  check(r.status === 409, `Re-registering taken username returns 409 (got ${r.status})`);
}

// 12. login with wrong password -> 401
{
  const r = await hit("POST", "/api/sync/login", {
    body: { username, password: "wrong" },
    jar: new Jar(),
  });
  check(r.status === 401, `Wrong-password login returns 401 (got ${r.status})`);
}

// 13. login with correct creds -> 200, restores access to existing payload
let secondJar;
{
  secondJar = new Jar();
  const r = await hit("POST", "/api/sync/login", {
    body: { username, password },
    jar: secondJar,
  });
  check(r.status === 200, "Correct login returns 200");
  check(secondJar.jar.has("hitab_sync"), "Login sets hitab_sync cookie");
}
{
  const r = await hit("GET", "/api/sync/whoami", { jar: secondJar });
  check(r.status === 200 && r.body.hasPayload === true && r.body.updated_at === firstStamp,
    "After re-login whoami sees the previously written payload");
}

// 14. CORS preflight from a *.pages.dev origin is allowed
{
  const r = await fetch(`${BASE}/api/sync/whoami`, {
    method: "OPTIONS",
    headers: {
      origin: "https://example.pages.dev",
      "access-control-request-method": "GET",
      "access-control-request-headers": "x-requested-with",
    },
  });
  check(r.status === 204, `CORS preflight from .pages.dev returns 204 (got ${r.status})`);
  check(r.headers.get("access-control-allow-origin") === "https://example.pages.dev",
    "CORS preflight sets allow-origin for *.pages.dev");
}

// 15. CORS preflight from disallowed origin is rejected (no allow-origin)
{
  const r = await fetch(`${BASE}/api/sync/whoami`, {
    method: "OPTIONS",
    headers: {
      origin: "https://evil.example.com",
      "access-control-request-method": "GET",
      "access-control-request-headers": "x-requested-with",
    },
  });
  const aco = r.headers.get("access-control-allow-origin");
  check(aco === null || aco === "",
    `CORS preflight from disallowed origin returns no allow-origin (got "${aco}")`);
}

console.log("\nAll verify-sync checks passed against", BASE);
