# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

HiTab (我的起始页) — a Chinese-language personal startpage. Single client-rendered Next.js page that bookmarks, todos, notes, calendar, wallpaper, hot lists and a multi-engine search bar. Persistent state lives only in the browser under `hitab-personal:v1`; no built-in account or cloud sync. Two deployment surfaces:

- **Sites (Cloudflare Workers via Vinext)** — used by the upstreamed repo.
- **Aliyun ECS** — `home.douwuyou.cn`, HTTPS via outer Nginx gateway → inner static nginx container, see `deploy/ecs/README.md`. Sync is optional, behind a Fastify cookie session under `/api/sync/*`.

The Chinese user-facing README (`README.md`) describes features and assets in more detail.

## Common commands

Node.js 22.13+ required.

```sh
npm ci                  # plain install
npm run install:ci      # CI / sandboxed install (sets SHARP_IGNORE_GLOBAL_LIBVIPS=1)
npm run dev             # vite dev server via vinext on http://127.0.0.1:5173
npm run build           # static export → dist/client/  (also produces dist/server/wrangler.json)
npm run start           # wrangler dev against dist/server/wrangler.json (uses .wrangler/state)
npm run lint            # eslint, ignores dist/ and .next/
npx tsc --noEmit        # type check only
npm run db:generate     # drizzle-kit migrations (only meaningful if db/schema.ts is populated)
node deploy/ecs/verify.mjs [ipv4]   # smoke-test the ECS deployment (anonymous against home.douwuyou.cn)
bash deploy/ecs/install.sh alog-prod  # run the deploy pipeline
```

Local single-test pattern: there are no unit tests in this repo. Verification is `npx tsc --noEmit` + `npm run build` + (for ECS) `node deploy/ecs/verify.mjs`.

## Architecture overview

### Static-export Next.js with Vinext + Cloudflare plugin

`next.config.ts` sets `output: "export"` and the page is a `"use client"` component, so the build produces plain HTML/JS in `dist/client/`. The Cloudflare Worker entrypoint lives in `build/sites-worker.ts` (consumed by `@cloudflare/vite-plugin`) and the `sites` vite plugin in `build/sites-vite-plugin.ts` (vendored from `@openai/sites-vite-plugin@0.2.0` — license in `build/sites-vite-plugin.LICENSE`) handles local mock auth via `oai-authenticated-user-*` headers and a `__sites_local_auth` cookie.

`vite.config.ts` reads binding config from `.openai/hosting.json` and an execution profile from `.sites-runtime/execution-profile.json`:

- `portable` — plain Vite/vinext CLI, `mockAuth: true`.
- `managed-linux` — sandboxed Sites runner; `mockAuth: false`, dev/build goes through `scripts/sites-env.sh` / `scripts/build-verified.sh` (timeout-bounded builds), install goes through `scripts/install-ci.sh`.

### Single page composition (`app/page.tsx`)

The whole UI is one client component that pulls schema/seed data from `lib/home-data.ts`, renders shadcn primitives from `components/ui/*`, and wraps everything in `Sidebar` + `Tabs` + `Dialog`. State is held in React state and mirrored to `localStorage[STORAGE_KEY]`; bookmark icons are loaded via `components/bookmark-icon.tsx` which calls `lib/bookmark-icons.ts` (`bookmarkIconSources`). That helper returns, in order: bundled `/assets/<icon>`, then `https://<host>/favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, then DuckDuckGo's `icons.duckduckgo.com/ip3/<host>.ico`. Each remote source gets a 5s timeout (`IconSources` effect in `bookmark-icon.tsx`).

### Connectors (Sites MCP-style tools)

When a Site runtime exposes connected apps, the request flows:

```
env.CONNECTORS (Worker service binding)
  → sites-worker.ts (Cloudflare env) or virtual:sites-connector-preview (local dev)
  → runWithConnectorBinding (AsyncLocalStorage in lib/connector-context.ts)
  → connectorsForRequest() (lib/connectors.ts)
  → createConnectors(binding).invoke / .getContext
```

`lib/connector-contract.mts` defines `ConnectorBinding`, `ConnectorResult`, `ConnectorFailureStatus` and `createConnectors`. `lib/connector-errors.mts` validates runtime envelopes and shapes reauth UX via `components/connector-error.tsx`. The dev bridge lives in `build/connector-preview-plugin.mjs` (Vite middleware reading `.sites-runtime/connector-preview/session.json` written by an external agent) and the auxiliary Worker in `build/connector-preview-worker.mjs`. In production builds the bridge code is tree-shaken — only `sites-worker.ts` remains.

### ECS deployment

Pipeline (`deploy/ecs/install.sh`, runs locally):

1. `npx tsc --noEmit` + `npm run build`.
2. Tar `dist/client/` (with `--no-xattrs` and `COPYFILE_DISABLE=1` to strip macOS metadata) and ship `compose.yaml`, `nginx.conf`, `http.conf`, `https.conf`, `install.sh` to `alog-prod:/opt/homepage/incoming/<sha14>-<utc>/`.

Server-side (`deploy/ecs/deploy.sh`):

- Extracts into `/opt/homepage/releases/<release>/`, atomically swaps `/opt/homepage/current` symlink.
- `docker compose up -d --force-recreate --no-deps web` (nginx container, see `deploy/ecs/compose.yaml`).
- Writes `/etc/family-diary/nginx-extra/homepage.conf` from `http.conf` + (if cert present) `https.conf`, runs `nginx -t` on both gateway and web, reloads.
- Healthchecks via `wget http://127.0.0.1/healthz`.

`deploy/ecs/create-login.mjs` is a dormant idempotent script retained for any future HTTP Basic re-enable; it is NOT invoked from `deploy.sh` anymore.

`deploy/ecs/verify.mjs` is the post-deploy smoke test: HTTP→HTTPS redirect, anonymous `200` on `/`, the JS bundle, and `/assets/night-city.jpg`, sensitive path 404s (`/.env.ecs.login.json`, `/vinext-client-entry-manifest.json`).

## Important repo-specific conventions

- **`components/ui/**` and `hooks/use-mobile.ts` are vendored verbatim from shadcn@4.17.0.** `eslint.config.mjs` deliberately relaxes `@typescript-eslint/no-unused-vars`, `react-hooks/purity` and `react-hooks/set-state-in-effect` for these paths. Do not refactor them; extend via wrapper components in `components/` instead.
- **`.env.ecs.login.json` and `.env.ecs.htpasswd` are gitignored and chmod 600**, but no longer shipped or referenced by the ECS deploy. They exist only as a dormant fallback for future HTTP Basic re-enable. Do not log, screenshot, or commit them. To re-enable Basic: see `deploy/ecs/README.md`.
- **No tests.** Add a vitest harness and `npm test` script before relying on test-driven workflows.
- **Drizzle schema is empty by default** (`db/schema.ts`); the D1 example lives in `examples/d1/db/schema.ts`. Only run `npm run db:generate` after adding a real schema, and only if `.openai/hosting.json` actually wires the `d1` binding.
- **No `pages/` or app-router server routes beyond `layout.tsx`/`page.tsx`.** `next.config.ts` is static export — adding `getServerSideProps` or a server route will break the ECS build. All UI lives in `app/page.tsx`.
- **`page.tsx` is one large client component on purpose.** Sub-files were tried and re-merged; new feature areas should be added as additional exports/hooks within the same file or as small components in `components/`, not as separate routes.
- **Sites connector code is dev-only.** Any new import that pulls `lib/connector-*` from a server bundle must stay inside routes Vinext treats as server-side; `lib/connector-errors.mts` uses lazy `zod` parsing so the client bundle stays tree-shakeable.
- **`grep` checks before deploy:** run `npx tsc --noEmit && npm run lint && npm run build` and, when touching ECS, re-run `node deploy/ecs/verify.mjs` against the live host.