// schemas.mjs - zod schemas for HTTP request bodies.
// The HomeState shape lives in lib/home-data.ts on the client; the server treats `blob`
// as opaque JSON and trusts the client's stateSchema to validate before upload.

import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_-]+$/i, "用户名仅可包含字母、数字、下划线和短横线，长度 3-32");

export const passwordSchema = z
  .string()
  .min(8)
  .max(128, "密码长度需在 8-128 之间");

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export const putStateSchema = z.object({
  blob: z.unknown(),
  schema_version: z.number().int().min(1).max(2),
  device_id: z.string().max(64).optional(),
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
