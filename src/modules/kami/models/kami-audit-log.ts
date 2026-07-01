import { model } from "@medusajs/framework/utils"

const KamiAuditLog = model.define("KamiAuditLog", {
  id: model.id({ prefix: "kmaud" }).primaryKey(),
  session_id: model.text().nullable(),
  tool: model.text(),
  args: model.json().nullable(),
  result_summary: model.text().nullable(),
  risk_level: model
    .enum(["read", "safe", "mutating", "destructive"])
    .default("safe"),
  actor: model.enum(["kami", "human"]).default("kami"),
  approved_by: model.text().nullable(),
  metadata: model.json().nullable(),
})

export default KamiAuditLog
