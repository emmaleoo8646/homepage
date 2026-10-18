// schemas.mjs - zod schemas for HTTP request bodies.
// The HomeState shape lives in lib/home-data.ts on the client; the server treats `blob`
// as opaque JSON and trusts the client's stateSchema to validate before upload.

import { z } from "zod";

export const usernameSchema = z
  .string({
    required_error: "请输入用户名",
    invalid_type_error: "用户名格式不正确",
  })
  .trim()
  .min(3, "用户名至少需要 3 个字符")
  .max(32, "用户名不能超过 32 个字符")
  .regex(/^[a-z0-9_-]+$/i, "用户名仅可包含字母、数字、下划线和短横线");

export const passwordSchema = z
  .string({
    required_error: "请输入密码",
    invalid_type_error: "密码格式不正确",
  })
  .min(8, "密码至少需要 8 个字符")
  .max(128, "密码不能超过 128 个字符");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

// Login uses min(1) so empty password surfaces a Chinese "请输入密码" rather than the
// default "String must contain at least 1 character(s)". Credential validity (whether
// the password matches) is the database lookup, not zod.
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "请输入密码"),
});

export const putStateSchema = z.object({
  blob: z.unknown(),
  schema_version: z
    .number({ invalid_type_error: "schema_version 必须为数字" })
    .int("schema_version 必须为整数")
    .min(1, "schema_version 必须 ≥ 1")
    .max(2, "schema_version 必须 ≤ 2"),
  device_id: z
    .string({ invalid_type_error: "device_id 必须为字符串" })
    .max(64, "device_id 长度不可超过 64")
    .optional(),
});

// Strip surrounding quotes per RFC 7232; allow plain values for flexibility.
export function parseIfMatch(header) {
  if (!header) return null;
  const trimmed = String(header).trim();
  if (!trimmed) return null;
  if (trimmed === "*") return "*";
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const FIELD_LABELS = {
  username: "用户名",
  password: "密码",
  schema_version: "schema_version",
  device_id: "device_id",
  blob: "blob",
};

// Map a zod ZodError to a single human-readable zh-CN string. Issues are labelled with
// the offending field name and joined with `；` so the UI can show everything at once
// in one line. Used by both auth and state routes for consistent 400 messages.
export function formatZodIssues(error) {
  if (!error || !Array.isArray(error.issues) || error.issues.length === 0) {
    return "请求格式不正确";
  }
  return error.issues
    .map((issue) => {
      const field = issue.path[0];
      const label =
        FIELD_LABELS[field] ??
        (typeof field === "string" ? field : "请求");
      return `${label}：${issue.message}`;
    })
    .join("；");
}
