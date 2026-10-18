// lib/sync-state.ts - React hook that drives the sync backend.
//
// State machine:
//   logged-out -> no auto-push, no auto-pull, only login/register UI
//   logged-in  -> debounced auto-push on local change, manual pull button
//   conflict   -> pause auto-push, render an inline banner; user picks resolution
//
// Cookies are httpOnly, so the server is the only thing that knows the session token.
// We only persist the username (never the token) so the UI can render "logged in as X"
// across reloads; the next request proves via 200/401 whether the cookie is still live.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  SYNC_BASE_URL_STORAGE_KEY,
  SYNC_SESSION_STORAGE_KEY,
  stateSchema,
  type HomeState,
} from "@/lib/home-data";
import {
  syncFetch,
  syncLogin,
  syncLogout,
  syncPull,
  syncPush,
  syncRegister,
  syncWhoami,
  type SyncResult,
} from "@/lib/sync-client";

const PUSH_DEBOUNCE_MS = 2000;
const ERROR_COOLDOWN_MS = 30_000;

export type SyncStatus = "idle" | "pushing" | "pulling" | "error";

export type SyncConflict = {
  remote: HomeState;
  remoteUpdatedAt: string;
};

export type SyncUser = { username: string };

export type SyncController = {
  user: SyncUser | null;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  status: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  conflict: SyncConflict | null;
  login: (
    username: string,
    password: string,
  ) => Promise<SyncResult<{ username: string }>>;
  register: (
    username: string,
    password: string,
  ) => Promise<SyncResult<{ username: string }>>;
  logout: () => Promise<void>;
  pull: () => Promise<void>;
  resolveConflict: (
    strategy: "overwrite-local" | "keep-local" | "cancel",
  ) => Promise<void>;
};

function readBaseUrl(fallback: string): string {
  try {
    const v = localStorage.getItem(SYNC_BASE_URL_STORAGE_KEY);
    return v && v.trim() ? v.trim() : fallback;
  } catch {
    return fallback;
  }
}

function writeBaseUrl(v: string) {
  try {
    if (v && v.trim()) localStorage.setItem(SYNC_BASE_URL_STORAGE_KEY, v.trim());
    else localStorage.removeItem(SYNC_BASE_URL_STORAGE_KEY);
  } catch {
    /* storage unavailable; follow page.tsx's storageError path */
  }
}

function readSessionUser(): SyncUser | null {
  try {
    const raw = localStorage.getItem(SYNC_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { username?: unknown }).username === "string"
    ) {
      return { username: (parsed as { username: string }).username };
    }
    return null;
  } catch {
    return null;
  }
}

function writeSessionUser(v: SyncUser | null) {
  try {
    if (v) {
      localStorage.setItem(
        SYNC_SESSION_STORAGE_KEY,
        JSON.stringify({ username: v.username }),
      );
    } else {
      localStorage.removeItem(SYNC_SESSION_STORAGE_KEY);
    }
  } catch {
    /* follow storageError */
  }
}

const defaultBaseUrl = (): string => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/sync`;
};

export function useSync(
  data: HomeState,
  setData: (fn: (d: HomeState) => HomeState) => void,
  ready: boolean,
  storageError: boolean,
): SyncController {
  const [user, setUser] = useState<SyncUser | null>(null);
  const [baseUrl, setBaseUrlState] = useState<string>(() => readBaseUrl(defaultBaseUrl()));
  const [syncPrimed, setSyncPrimed] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDataRef = useRef<HomeState>(data);
  const pushGuard = useRef<symbol | null>(null);

  useEffect(() => {
    lastDataRef.current = data;
  }, [data]);

  // On mount (or whenever `ready` flips on), ask whoami to verify any stored session.
  useEffect(() => {
    if (!ready || storageError) return;
    let cancelled = false;
    const stored = readSessionUser();
    if (!stored) {
      setSyncPrimed(true);
      return;
    }
    setUser(stored);
    syncWhoami(baseUrl).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setLastSyncedAt(res.data.updated_at);
        setSyncPrimed(true);
      } else if (res.status === 401) {
        setUser(null);
        writeSessionUser(null);
        setSyncPrimed(false);
      } else {
        // Network/server trouble: keep the user but don't enable auto-push yet.
        setSyncPrimed(false);
        setErrorMessage(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Auto-push on local change. Gated on:
  //   * storage healthy
  //   * user signed in
  //   * whoami has resolved (syncPrimed)
  //   * no unresolved conflict (would race the user's choice)
  //   * status not in error cooldown
  //   * data is structurally valid
  useEffect(() => {
    if (!ready || storageError) return;
    if (!user || !syncPrimed) return;
    if (status === "error" || status === "pushing" || status === "pulling") return;
    if (conflict) return;

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      if (storageError) return;
      const guard = Symbol("push");
      pushGuard.current = guard;

      const validated = stateSchema.safeParse(lastDataRef.current);
      if (!validated.success) {
        setStatus((prev) => (prev === "pushing" ? "idle" : prev));
        return;
      }
      const payload = {
        ...validated.data,
        lastModified: new Date().toISOString(),
      };
      const ifMatch = lastSyncedAt ?? "*";

      setStatus("pushing");
      const res = await syncPush(baseUrl, payload, ifMatch);
      if (pushGuard.current !== guard) return;

      if (res.ok) {
        setLastSyncedAt(res.data.updated_at);
        setStatus("idle");
        setErrorMessage(null);
        return;
      }
      if (res.status === 412) {
        const pull = await syncPull(baseUrl);
        if (pushGuard.current !== guard) return;
        if (pull.ok) {
          const remoteValid = stateSchema.safeParse(pull.data.blob);
          if (remoteValid.success) {
            setConflict({
              remote: remoteValid.data,
              remoteUpdatedAt: pull.data.updated_at,
            });
          }
        }
        setStatus("idle");
        return;
      }
      if (res.status === 401) {
        setUser(null);
        setSyncPrimed(false);
        writeSessionUser(null);
        setStatus("idle");
        toast.error("同步会话已过期，请重新登录");
        return;
      }
      setErrorMessage(res.error);
      setStatus("error");
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [
    data,
    user,
    syncPrimed,
    status,
    conflict,
    baseUrl,
    ready,
    storageError,
    lastSyncedAt,
  ]);

  // Error cooldown: after a failed push, idle again so the user can retry.
  useEffect(() => {
    if (status !== "error") return;
    const t = setTimeout(() => setStatus("idle"), ERROR_COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [status, errorMessage]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await syncLogin(baseUrl, username, password);
      if (res.ok) {
        setUser({ username: res.data.username });
        writeSessionUser({ username: res.data.username });
        setSyncPrimed(false);
        const who = await syncWhoami(baseUrl);
        if (who.ok) {
          setLastSyncedAt(who.data.updated_at);
        }
        setSyncPrimed(true);
      }
      return res;
    },
    [baseUrl],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const res = await syncRegister(baseUrl, username, password);
      if (res.ok) {
        setUser({ username: res.data.username });
        writeSessionUser({ username: res.data.username });
        // Try to seed the cloud with the user's existing local state. If this fails,
        // a manual pull later will still recover because the cloud starts empty.
        const validated = stateSchema.safeParse(lastDataRef.current);
        if (validated.success) {
          const pushRes = await syncPush(
            baseUrl,
            { ...validated.data, lastModified: new Date().toISOString() },
            "*",
            "register",
          );
          if (pushRes.ok) {
            setLastSyncedAt(pushRes.data.updated_at);
            toast.success("账号已注册，本地数据已上传");
          } else if (pushRes.status !== 412) {
            toast.error("本地数据上传失败，稍后可手动同步");
          }
        }
        setSyncPrimed(true);
      }
      return res;
    },
    [baseUrl],
  );

  const logout = useCallback(async () => {
    await syncLogout(baseUrl);
    setUser(null);
    setSyncPrimed(false);
    writeSessionUser(null);
    setLastSyncedAt(null);
    setConflict(null);
    setStatus("idle");
    setErrorMessage(null);
  }, [baseUrl]);

  const pull = useCallback(async () => {
    if (!user) {
      toast.error("请先登录");
      return;
    }
    setStatus("pulling");
    const res = await syncPull(baseUrl);
    if (res.ok) {
      const validated = stateSchema.safeParse(res.data.blob);
      if (validated.success) {
        setData(() => validated.data);
        setLastSyncedAt(res.data.updated_at);
      } else {
        toast.error("云端数据格式错误，无法合并");
      }
    } else if (res.status === 401) {
      setUser(null);
      setSyncPrimed(false);
      writeSessionUser(null);
      toast.error("同步会话已过期，请重新登录");
    } else {
      toast.error(res.error);
    }
    setStatus("idle");
  }, [baseUrl, user, setData]);

  const resolveConflict = useCallback(
    async (strategy: "overwrite-local" | "keep-local" | "cancel") => {
      const current = conflict;
      if (!current) return;
      if (strategy === "cancel") {
        setConflict(null);
        return;
      }
      if (strategy === "overwrite-local") {
        setData(() => current.remote);
        setLastSyncedAt(current.remoteUpdatedAt);
        setConflict(null);
        return;
      }
      // keep-local: force overwrite the cloud with our current state.
      const validated = stateSchema.safeParse(lastDataRef.current);
      if (!validated.success) {
        toast.error("本地数据无效，无法覆盖云端");
        setConflict(null);
        return;
      }
      const res = await syncFetch<{ updated_at: string }>(
        baseUrl,
        "/api/sync/state",
        {
          method: "PUT",
          ifMatch: current.remoteUpdatedAt,
          body: {
            blob: { ...validated.data, lastModified: new Date().toISOString() },
            schema_version: validated.data.version,
          },
        },
      );
      if (res.ok) {
        setLastSyncedAt(res.data.updated_at);
      } else if (res.status === 412) {
        toast.error("云端再次被更新，请重新选择");
      } else {
        toast.error(res.error);
      }
      setConflict(null);
    },
    [conflict, baseUrl, setData],
  );

  const setBaseUrl = useCallback((v: string) => {
    writeBaseUrl(v);
    setBaseUrlState(v && v.trim() ? v.trim() : defaultBaseUrl());
  }, []);

  return {
    user,
    baseUrl,
    setBaseUrl,
    status,
    lastSyncedAt,
    errorMessage,
    conflict,
    login,
    register,
    logout,
    pull,
    resolveConflict,
  };
}
