import type KamiModuleService from "../../modules/kami/services/kami-module-service"

type SeedSkill = {
  name: string
  description: string
  category: string
  version: string
  content: string
}

const seedSkills: SeedSkill[] = [
  {
    name: "fulfill-order",
    description: "Inspect an order and prepare safe fulfillment actions.",
    category: "commerce",
    version: "0.1.0",
    content: [
      "# fulfill-order",
      "",
      "Use this skill when the user asks KAMI to fulfill or ship an order.",
      "",
      "Procedure:",
      "1. Read the order with `get_order` before taking action.",
      "2. Verify status, payment, items, shipping address, and fulfillment state.",
      "3. If data is missing, ask for the missing concrete ID or value.",
      "4. Prefer summarizing the exact fulfillment plan before mutation.",
      "5. Treat cancel/refund/destructive follow-up actions as approval-gated.",
      "",
      "Evidence to report: order id, display id, status, item count, fulfillment state.",
    ].join("\n"),
  },
  {
    name: "restock-low-inventory",
    description: "Find low inventory signals and draft restock actions.",
    category: "inventory",
    version: "0.1.0",
    content: [
      "# restock-low-inventory",
      "",
      "Use this skill when the user asks for low stock review or restock planning.",
      "",
      "Procedure:",
      "1. Start with `list_inventory` using a small limit and relevant filters.",
      "2. Compare SKU/title and available inventory evidence before recommending restock.",
      "3. Do not mutate inventory without a clear SKU/item id and requested quantity.",
      "4. Return a compact table of SKU, title, current signal, and recommended action.",
      "",
      "Evidence to report: inventory item id, SKU, title, and count/source when available.",
    ].join("\n"),
  },
  {
    name: "create-product-variant",
    description: "Create or update product variant data with preflight checks.",
    category: "catalog",
    version: "0.1.0",
    content: [
      "# create-product-variant",
      "",
      "Use this skill when creating or changing product options or variants.",
      "",
      "Procedure:",
      "1. Read the product with `get_product` first.",
      "2. Verify existing options, variants, SKUs, and required price currency.",
      "3. Ask for any missing option value, SKU, price, or inventory policy.",
      "4. Use `update_product` only after the desired variant payload is explicit.",
      "5. Report the exact product id and variant ids returned by the system.",
      "",
      "Avoid guessing SKUs, prices, option names, or currencies.",
    ].join("\n"),
  },
  {
    name: "daily-sales-report",
    description: "Generate a concise daily commerce report from store data.",
    category: "analytics",
    version: "0.1.0",
    content: [
      "# daily-sales-report",
      "",
      "Use this skill for daily sales, order, customer, or catalog snapshots.",
      "",
      "Procedure:",
      "1. Call `sales_summary` first for a broad read-only overview.",
      "2. Pull focused samples with `list_orders`, `list_products`, and `list_customers`.",
      "3. State exact filters/time window used. If no time window is provided, ask or use today.",
      "4. Separate observed data from inference.",
      "5. End with concrete next actions and IDs/counts.",
      "",
      "Never invent revenue, conversion, or inventory numbers not returned by tools.",
    ].join("\n"),
  },
]

let seeded = false

export const ensureDefaultSkills = async (kami: KamiModuleService) => {
  if (seeded) {
    return
  }

  const existing = await kami.listKamiSkills(
    { name: seedSkills.map((skill) => skill.name) },
    { take: seedSkills.length }
  )
  const existingNames = new Set(existing.map((skill: any) => skill.name))
  const missing = seedSkills.filter((skill) => !existingNames.has(skill.name))

  if (missing.length) {
    await kami.createKamiSkills(
      missing.map((skill) => ({
        ...skill,
        origin: "human",
        disabled: false,
        frontmatter: {
          name: skill.name,
          description: skill.description,
          version: skill.version,
          platforms: ["medusa"],
        },
        platforms: ["medusa"],
        metadata: {
          seed: true,
        },
      })) as unknown as Parameters<typeof kami.createKamiSkills>[0]
    )
  }

  seeded = true
}

