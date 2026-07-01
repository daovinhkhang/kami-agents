import { model } from "@medusajs/framework/utils"

const KamiJob = model.define("KamiJob", {
  id: model.id({ prefix: "kmjob" }).primaryKey(),
  name: model.text(),
  prompt: model.text(),
  schedule: model.text(),
  deliver: model.json().nullable(),
  session_id: model.text().nullable(),
  enabled: model.boolean().default(true),
  next_run_at: model.dateTime().nullable(),
  last_run_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})

export default KamiJob
