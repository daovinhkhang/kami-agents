import { model } from "@medusajs/framework/utils"

const KamiReportTemplate = model.define("KamiReportTemplate", {
  id: model.id({ prefix: "kmrtmpl" }).primaryKey(),
  name: model.text(),
  title: model.text(),
  description: model.text().nullable(),
  prompt: model.text(),
  required_tools: model.json().nullable(),
  artifact_schema: model.json().nullable(),
  category: model.text().default("general"),
  disabled: model.boolean().default(false),
  metadata: model.json().nullable(),
})

export default KamiReportTemplate
