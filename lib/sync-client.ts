// lib/sync-client.ts - thin fetch wrappers over the sync server. No React, no DOM deps
// beyond fetch itself. All cookies are httpOnly; the client never sees the session token.

import type { HomeState } from "@/lib/home-data";

export type SyncResult<T> =
  | { ok: true; status: number; data: T; etag: string | null }
  | { ok: false; status: number; code: string; error: string };

export type SyncFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  ifMatch?: string;
  signal?: AbortSignal;
};

export type WhoamiResponse = {
  username: string;
  hasPayload: boolean;
  updated_at: string | null;
};

export type PullResponse = {
  blob: HomeState;
  updated_at: string;
  device_id: string;
  schema_version: number;
};

export type PushResponse = {
  updated_at: string;
  schema_version: number;
};

// 200ms, 800ms, 3200ms - cumulative ~4.2s, well under the debounce window of 2s so a
// successful fast retry stays inside one push cycle.
const RETRY_DELAYS_MS = [200, 800, 3200] as const;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function normalizeIfMatch(value: string): string {
  // Send the raw updated_at timestamp; the server strips surrounding quotes if present
  // and accepts plain values too.
  return value === "*" ? "*" : value;
}

function parseEtag(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") return trimmed || null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function attempt<T>(
  url: string,
  opts: SyncFetchOptions,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ res: Response; parsed: T | { error?: string; code?: string } | null }> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal,
  });

  const text = await res.text();
  let parsed: T | { error?: string; code?: string } | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  return { res, parsed };
}

export async function syncFetch<T = unknown>(
  baseUrl: string,
  path: string,
  opts: SyncFetchOptions = {},
): Promise<SyncResult<T>> {
  let url: URL;
  try {
    url = new URL(path, baseUrl);
  } catch {
    return { ok: false, status: 0, code: "invalid_input", error: "同步服务器地址无效" };
  }
  const fullUrl = url.toString();
  const headers: Record<string, string> = {
    "x-requested-with": "fetch",
    accept: "application/json",
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json; charset=utf-8";
  if (opts.ifMatch !== undefined) headers["if-match"] = normalizeIfMatch(opts.ifMatch);

  let lastError: { status: number; code: string; error: string } | null = null;
  const totalAttempts = RETRY_DELAYS_MS.length + 1;
  for (let i = 0; i < totalAttempts; i++) {
    try {
      const { res, parsed } = await attempt<T>(fullUrl, opts, headers, opts.signal);
      const body = (parsed ?? {}) as { error?: string; code?: string };

      if (res.status >= 200 && res.status < 300) {
        const etag = parseEtag(res.headers.get("etag"));
        if (res.status === 204 || parsed === null) {
          return { ok: true, status: res.status, data: undefined as T, etag };
        }
        return { ok: true, status: res.status, data: parsed as T, etag };
      }

      // 4xx: do not retry.
      if (res.status >= 400 && res.status < 500) {
        return {
          ok: false,
          status: res.status,
          code: body.code ?? "unknown",
          error: body.error ?? `请求失败 (${res.status})`,
        };
      }

      lastError = {
        status: res.status,
        code: body.code ?? "internal",
        error: body.error ?? `服务器错误 (${res.status})`,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastError = {
        status: 0,
        code: "network",
        error: err instanceof Error ? err.message : "网络错误",
      };
    }
    if (i < RETRY_DELAYS_MS.length) {
      try {
        await sleep(RETRY_DELAYS_MS[i], opts.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw err;
      }
    }
  }
  const final: { ok: false; status: number; code: string; error: string } = lastError
    ? { ok: false, ...lastError }
    : { ok: false, status: 0, code: "network", error: "网络错误" };
  return final;
}

export async function syncRegister(
  baseUrl: string,
  username: string,
  password: string,
): Promise<SyncResult<{ username: string }>> {
  return syncFetch<{ username: string }>(baseUrl, "/api/sync/register", {
    method: "POST",
    body: { username, password },
  });
}

export async function syncLogin(
  baseUrl: string,
  username: string,
  password: string,
): Promise<SyncResult<{ username: string }>> {
  return syncFetch<{ username: string }>(baseUrl, "/api/sync/login", {
    method: "POST",
    body: { username, password },
  });
}

export async function syncLogout(baseUrl: string): Promise<SyncResult<undefined>> {
  return syncFetch<undefined>(baseUrl, "/api/sync/logout", { method: "POST" });
}

export async function syncWhoami(baseUrl: string): Promise<SyncResult<WhoamiResponse>> {
  return syncFetch<WhoamiResponse>(baseUrl, "/api/sync/whoami");
}

export async function syncPull(baseUrl: string): Promise<SyncResult<PullResponse>> {
  return syncFetch<PullResponse>(baseUrl, "/api/sync/state");
}

export async function syncPush(
  baseUrl: string,
  blob: HomeState,
  ifMatch: string,
  deviceId?: string,
): Promise<SyncResult<PushResponse>> {
  return syncFetch<PushResponse>(baseUrl, "/api/sync/state", {
    method: "PUT",
    body: { blob, schema_version: blob.version, device_id: deviceId ?? "" },
    ifMatch,
  });
}
