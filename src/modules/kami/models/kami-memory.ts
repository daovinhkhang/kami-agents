import { model } from "@medusajs/framework/utils"

const KamiMemory = model.define("KamiMemory", {
  id: model.id({ prefix: "kmmem" }).primaryKey(),
  user_id: model.text().nullable(),
  session_id: model.text().nullable(),
  type: model
    .enum(["factual", "preference", "goal", "instruction", "event"])
    .default("factual"),
  content: model.text(),
  importance: model.number().default(1),
  metadata: model.json().nullable(),
})

export default KamiMemory
