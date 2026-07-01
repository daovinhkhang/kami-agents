import { model } from "@medusajs/framework/utils"

// Phase 0 fields. Full-text search on `title` (+ message content) is added in Phase 1
// via a tsvector migration, to keep the bootstrap migration hand-writable and exact.
const KamiSession = model.define("KamiSession", {
  id: model.id({ prefix: "kms" }).primaryKey(),
  title: model.text().nullable(),
  source: model.enum(["admin", "cron", "gateway", "api"]).default("admin"),
  user_id: model.text().nullable(),
  parent_session_id: model.text().nullable(),
  status: model
    .enum(["active", "completed", "halted", "error"])
    .default("active"),
  message_count: model.number().default(0),
  metadata: model.json().nullable(),
})

export default KamiSession
