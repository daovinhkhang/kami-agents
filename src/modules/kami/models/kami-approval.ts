import { model } from "@medusajs/framework/utils"

const KamiApproval = model.define("KamiApproval", {
  id: model.id({ prefix: "kmapr" }).primaryKey(),
  session_id: model.text().nullable(),
  tool: model.text(),
  args: model.json().nullable(),
  status: model
    .enum(["pending", "approved", "rejected", "executed"])
    .default("pending"),
  requested_at: model.dateTime().nullable(),
  decided_by: model.text().nullable(),
  decided_at: model.dateTime().nullable(),
  execution_result: model.json().nullable(),
  metadata: model.json().nullable(),
})

export default KamiApproval
