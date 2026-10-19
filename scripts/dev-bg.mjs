#!/usr/bin/env node
// scripts/dev-bg.mjs — 后台守护 `npm run dev`，支持 start/stop/restart/status。
// 用法: node scripts/dev-bg.mjs {start|stop|restart|status}
import { spawn } from "node:child_process";
import {
  openSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";

const PID_FILE = ".dev.pid";
const LOG_FILE = ".dev.log";
const PORT = 5173;
const action = process.argv[2] ?? "start";

const readPid = () => {
  if (!existsSync(PID_FILE)) return null;
  const pid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
  if (!Number.isFinite(pid)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    unlinkSync(PID_FILE);
    return null;
  }
};

const start = () => {
  const pid = readPid();
  if (pid) {
    console.log(`● 已在运行 (PID ${pid}) → http://127.0.0.1:${PORT}`);
    return;
  }
  const out = openSync(LOG_FILE, "a");
  const child = spawn("npm", ["run", "dev"], {
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log(`● 已启动 (PID ${child.pid})`);
  console.log(`  访问:   http://127.0.0.1:${PORT}`);
  console.log(`  日志:   tail -f ${LOG_FILE}`);
  console.log(`  重启:   npm run dev:restart`);
};

const stop = () => {
  const pid = readPid();
  if (!pid) {
    console.log("○ 未运行");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`● 已停止 (PID ${pid})`);
  } catch (e) {
    console.log(`✗ 停止失败: ${e.message}`);
  }
  unlinkSync(PID_FILE);
};

const restart = () => {
  const pid = readPid();
  if (pid) {
    process.kill(pid, "SIGTERM");
    unlinkSync(PID_FILE);
    setTimeout(start, 1000);
  } else {
    start();
  }
};

const status = () => {
  const pid = readPid();
  console.log(pid ? `● 运行中 (PID ${pid})` : "○ 未运行");
};

const handlers = { start, stop, restart, status };
const handler = handlers[action];
if (handler) {
  handler();
} else {
  console.error("用法: dev-bg {start|stop|restart|status}");
  process.exitCode = 1;
}
