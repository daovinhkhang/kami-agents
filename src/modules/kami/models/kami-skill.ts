import { model } from "@medusajs/framework/utils"

const KamiSkill = model.define("KamiSkill", {
  id: model.id({ prefix: "kmsk" }).primaryKey(),
  name: model.text(),
  description: model.text().nullable(),
  category: model.text().nullable(),
  version: model.text().default("0.1.0"),
  content: model.text(),
  frontmatter: model.json().nullable(),
  origin: model.enum(["agent", "human", "hub"]).default("human"),
  platforms: model.json().nullable(),
  disabled: model.boolean().default(false),
  metadata: model.json().nullable(),
})

export default KamiSkill
