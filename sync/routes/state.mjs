// routes/state.mjs - GET / PUT a HomeState-shaped blob per session user.

import {
  getPayload,
  getPayloadMeta,
  upsertPayload,
} from "../db.mjs";
import { parseIfMatch, putStateSchema, formatZodIssues } from "../schemas.mjs";

export async function stateRoutes(app, { db }) {
  app.get("/api/sync/state", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "未登录", code: "unauthorized" });
    }
    const row = getPayload(db, user.userId);
    if (!row) {
      return reply.code(204).send();
    }
    let blob;
    try {
      blob = JSON.parse(row.blob.toString("utf8"));
    } catch {
      request.log.error({ userId: user.userId }, "stored blob is not valid utf-8 JSON");
      return reply.code(500).send({ error: "云端数据损坏", code: "internal" });
    }
    reply.header("ETag", `"${row.updated_at}"`);
    return reply.code(200).send({
      blob,
      updated_at: row.updated_at,
      device_id: row.device_id,
      schema_version: row.schema_version,
    });
  });

  app.put("/api/sync/state", async (request, reply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.code(401).send({ error: "未登录", code: "unauthorized" });
    }

    const ifMatch = parseIfMatch(request.headers["if-match"]);
    if (!ifMatch) {
      return reply.code(428).send({
        error: "需要 If-Match 头才能写入",
        code: "invalid_input",
      });
    }

    const parsed = putStateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: formatZodIssues(parsed.error),
        code: "invalid_input",
      });
    }

    const existing = getPayloadMeta(db, user.userId);

    if (ifMatch === "*") {
      // Create-only — refuse to overwrite an existing record without an explicit version.
      if (existing) {
        return reply.code(412).send({
          error: "云端已存在数据，请先拉取最新版本",
          code: "conflict",
          updated_at: existing.updated_at,
        });
      }
    } else if (!existing || ifMatch !== existing.updated_at) {
      return reply.code(412).send({
        error: "云端已被更新，请先拉取最新版本",
        code: "conflict",
        updated_at: existing?.updated_at ?? null,
      });
    }

    let blobString;
    try {
      blobString = JSON.stringify(parsed.data.blob);
    } catch {
      return reply
        .code(400)
        .send({ error: "blob 不是可序列化的 JSON", code: "invalid_input" });
    }

    const updatedAt = new Date().toISOString();
    upsertPayload(
      db,
      user.userId,
      Buffer.from(blobString, "utf8"),
      updatedAt,
      parsed.data.device_id ?? "",
      parsed.data.schema_version,
    );

    reply.header("ETag", `"${updatedAt}"`);
    return reply.code(200).send({
      updated_at: updatedAt,
      schema_version: parsed.data.schema_version,
    });
  });
}
