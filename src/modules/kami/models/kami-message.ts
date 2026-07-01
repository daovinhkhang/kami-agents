import { model } from "@medusajs/framework/utils"

const KamiMessage = model.define("KamiMessage", {
  id: model.id({ prefix: "kmm" }).primaryKey(),
  session_id: model.text(),
  role: model.enum(["user", "assistant", "tool", "system"]),
  content: model.text().nullable(),
  tool_calls: model.json().nullable(),
  tool_call_id: model.text().nullable(),
  reasoning: model.json().nullable(),
  tokens_in: model.number().default(0),
  tokens_out: model.number().default(0),
  content_parts: model.json().nullable(),
  metadata: model.json().nullable(),
})

export default KamiMessage
