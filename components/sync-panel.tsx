"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  CloudOff,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HomeState } from "@/lib/home-data";
import { useSync, type SyncController } from "@/lib/sync-state";

type SyncPanelProps = {
  data: HomeState;
  setData: (fn: (d: HomeState) => HomeState) => void;
  ready: boolean;
  storageError: boolean;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "尚未同步";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "尚未同步";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`;
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SyncPanel({
  data,
  setData,
  ready,
  storageError,
}: SyncPanelProps) {
  // Always call the hook; it gates itself on `ready` and `storageError`.
  const sync = useSync(data, setData, ready, storageError);

  if (!ready) {
    return <p className="muted-note">正在加载同步设置…</p>;
  }
  if (storageError) {
    return (
      <div className="info-panel" style={{ padding: "20px 6px 8px" }}>
        <CloudOff size={42} />
        <h3>本地数据存储不可用</h3>
        <p>
          由于浏览器存储异常，此设备暂不能保存或同步数据。请先解决本地存储问题后再开启同步。
        </p>
      </div>
    );
  }
  if (!sync.user) {
    return <SignedOut sync={sync} />;
  }
  return <SignedIn sync={sync} data={data} setData={setData} />;
}

function SignedOut({ sync }: { sync: SyncController }) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const normalised = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(normalised)) {
      setError("用户名需为 3-32 位字母、数字、下划线或短横线");
      setBusy(false);
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      setBusy(false);
      return;
    }
    if (tab === "register" && password !== passwordConfirm) {
      setError("两次密码不一致");
      setBusy(false);
      return;
    }
    const fn = tab === "login" ? sync.login : sync.register;
    const res = await fn(normalised, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    toast.success(tab === "login" ? "登录成功" : "注册成功");
  };

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "login" | "register")}
      >
        <TabsList>
          <TabsTrigger value="login">登录</TabsTrigger>
          <TabsTrigger value="register">注册</TabsTrigger>
        </TabsList>
      </Tabs>
      <form onSubmit={submit} className="bookmark-form sync-form">
        <label htmlFor="sync-username">用户名</label>
        <input
          id="sync-username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          placeholder="3-32 位字母、数字、下划线或短横线"
          autoComplete="username"
        />
        <label htmlFor="sync-password">密码</label>
        <input
          id="sync-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位"
          autoComplete={
            tab === "login" ? "current-password" : "new-password"
          }
        />
        {tab === "register" && (
          <>
            <label htmlFor="sync-password-confirm">再次输入密码</label>
            <input
              id="sync-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button form-submit"
          type="submit"
          disabled={busy}
        >
          {tab === "login" ? "登录" : "注册并上传本地数据"}
        </button>
      </form>
      <p className="muted-note">
        同步服务仅在传输时使用 HTTPS，按用户名区分账号，不会将你的网址、待办或笔记用于其他用途。
      </p>
      <details className="sync-advanced">
        <summary>高级：自定义同步服务器</summary>
        <label htmlFor="sync-baseurl" className="sr-only">
          同步服务器地址
        </label>
        <input
          id="sync-baseurl"
          value={sync.baseUrl}
          onChange={(e) => sync.setBaseUrl(e.target.value)}
          placeholder="留空则使用本站默认地址"
          inputMode="url"
        />
        <p className="muted-note" style={{ margin: "8px 0 0" }}>
          当前生效地址：{sync.baseUrl}
        </p>
      </details>
    </>
  );
}

function SignedIn({
  sync,
  data,
  setData,
}: {
  sync: SyncController;
  data: HomeState;
  setData: (fn: (d: HomeState) => HomeState) => void;
}) {
  const isBusy = sync.status === "pushing" || sync.status === "pulling";
  return (
    <>
      <div className="sync-account-row">
        <span className="example-pill">
          <Check size={13} /> 已登录 · {sync.user?.username}
        </span>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void sync.logout();
          }}
          aria-label="切换账户"
        >
          <LogOut size={15} />
          切换账户
        </button>
      </div>
      <p className="muted-note sync-status-line">
        上次同步：{formatRelative(sync.lastSyncedAt)}
      </p>

      {sync.conflict && (
        <ConflictBanner sync={sync} data={data} setData={setData} />
      )}

      {sync.status === "error" && sync.errorMessage && (
        <p className="form-error sync-error" role="alert">
          {sync.errorMessage}
        </p>
      )}

      <button
        className="primary-button sync-pull"
        type="button"
        onClick={() => {
          void sync.pull();
        }}
        disabled={isBusy}
      >
        <RefreshCw size={16} />
        {sync.status === "pulling" ? "正在拉取…" : "立即同步"}
      </button>
      <p className="muted-note" style={{ marginTop: 12 }}>
        本地修改将在停止输入约 2 秒后自动推送；遇到云端有新版本时，会暂停推送让你选择保留哪一份。
      </p>
    </>
  );
}

function ConflictBanner({
  sync,
  data,
  setData,
}: {
  sync: SyncController;
  data: HomeState;
  setData: (fn: (d: HomeState) => HomeState) => void;
}) {
  const remoteTime = sync.conflict
    ? new Date(sync.conflict.remoteUpdatedAt).toLocaleString("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <div className="sync-conflict" role="alert">
      <div className="sync-conflict-headline">
        <AlertTriangle size={18} />
        <strong>云端已被更新</strong>
        <span className="sync-conflict-time">{remoteTime}</span>
      </div>
      <p className="muted-note" style={{ margin: "8px 0 12px" }}>
        另一台设备近期修改了云端数据，请选择保留哪一份。本操作会被自动推送到所有设备。
      </p>
      <div className="sync-conflict-actions">
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            const previous = data;
            void sync.resolveConflict("overwrite-local");
            toast("已使用云端版本", {
              action: {
                label: "撤销",
                onClick: () => setData(() => previous),
              },
            });
          }}
        >
          使用云端版本
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void sync.resolveConflict("keep-local");
          }}
        >
          使用本地覆盖云端
        </button>
        <button
          className="subtle-button"
          type="button"
          onClick={() => {
            void sync.resolveConflict("cancel");
          }}
        >
          稍后处理
        </button>
      </div>
    </div>
  );
}
