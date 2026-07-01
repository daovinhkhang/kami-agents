import { model } from "@medusajs/framework/utils"

const KamiArtifact = model.define("KamiArtifact", {
  id: model.id({ prefix: "kmart" }).primaryKey(),
  session_id: model.text(),
  type: model.enum(["report", "table", "chart", "export", "kpi", "draft"]).default("report"),
  title: model.text().nullable(),
  schema_version: model.text().default("1.0"),
  payload: model.json(),
  metadata: model.json().nullable(),
})

export default KamiArtifact
