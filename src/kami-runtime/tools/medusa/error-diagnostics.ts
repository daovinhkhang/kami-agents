/**
 * Medusa Error Diagnostics Engine
 *
 * When a Medusa workflow/step throws an error, this engine:
 * 1. Matches the error against known patterns
 * 2. Explains the ROOT CAUSE (what Medusa relation/link/data is missing)
 * 3. Suggests the CONCRETE FIX (which workflow/step to run, which IDs to link)
 *
 * This allows KAMI to self-diagnose and self-recover instead of dying with
 * a cryptic error message.
 */

// ── Pattern types ──────────────────────────────────────────────────────

interface ErrorPattern {
  /** Human-readable name for this error class */
  name: string
  /** Regex or substring to match against the error message */
  match: RegExp | string
  /** Explanation of WHY this error happens (Medusa internal chain) */
  rootCause: string
  /** Concrete fix — what workflow/API call resolves it */
  fix: string
  /** The Medusa modules/links involved */
  involvedModules: string[]
  /** Whether this is recoverable (model can fix it) or needs human */
  recoverable: boolean
}

// ── Known error patterns ───────────────────────────────────────────────

const PATTERNS: ErrorPattern[] = [
  {
    name: "sales-channel-not-linked-to-stock-location",
    match: "not associated with any stock location",
    rootCause:
      "Sales Channel (SC) is not linked to any Stock Location (SL) that holds inventory for this variant. " +
      "The order validation chain checks: variant → inventory_item → inventory_level → stock_location → sales_channel. " +
      "If no inventory_level exists at a stock_location that is linked to the sales_channel used in the order, this error fires.",
    fix:
      "Run linkSalesChannelsToStockLocationWorkflow with { id: <stock_location_id>, add: [<sales_channel_id>] }. " +
      "Also ensure inventory levels exist for all variants at that stock location via createInventoryLevelsWorkflow.",
    involvedModules: ["stock-location", "sales-channel", "inventory"],
    recoverable: true,
  },
  {
    name: "variant-missing-inventory-items",
    match: "does not have any inventory items associated with it",
    rootCause:
      "The product variant exists but has no inventory item linked to it. " +
      "When manage_inventory is true, the system creates inventory items automatically on product creation, " +
      "but they may have been deleted or the variant was created without manage_inventory.",
    fix:
      "Re-create the product with manage_inventory: true, or create inventory items manually via createInventoryItemsWorkflow " +
      "and link them to the variant. Then create inventory levels at a stock location linked to the sales channel.",
    involvedModules: ["inventory", "product"],
    recoverable: true,
  },
  {
    name: "insufficient-inventory",
    match: "does not have the required inventory",
    rootCause:
      "The variant has inventory levels but the available quantity (stocked - reserved) at all locations " +
      "linked to the sales channel is less than required_quantity × ordered_quantity. " +
      "If allow_backorder is false, the order is rejected.",
    fix:
      "Either set allow_backorder: true on the variant, or increase stocked_quantity via createInventoryLevelsWorkflow " +
      "or updateInventoryLevelsWorkflow. For seeding, prefer allow_backorder: true.",
    involvedModules: ["inventory", "product"],
    recoverable: true,
  },
  {
    name: "sku-collision",
    match: "already exists",
    rootCause:
      "A product variant or inventory item with this SKU already exists in the database. " +
      "SKUs must be globally unique across all products. This typically happens when " +
      "multiple products of the same type share size variants without unique material/grade/origin suffixes.",
    fix:
      "Make SKUs unique by including product-differentiating attributes: material code, grade code, origin country. " +
      "Format: {TYPE_PREFIX}-{MATERIAL}{GRADE}{ORIGIN}-{SIZE}. Example: BLG-TC88CN-M8X30 instead of BLG-M8X30. " +
      "If re-seeding, delete existing products AND inventory items first.",
    involvedModules: ["product", "inventory"],
    recoverable: true,
  },
  {
    name: "region-country-conflict",
    match: "already assigned to a region",
    rootCause:
      "Each country code can belong to exactly one region. Creating a second region with the same country fails. " +
      "The region likely already exists from a prior seed or default setup.",
    fix:
      "Reuse the existing region instead of creating a new one. Query by currency_code to find it. " +
      "Only create a new region if none exists with the desired country.",
    involvedModules: ["region"],
    recoverable: true,
  },
  {
    name: "category-has-children",
    match: "with category children is not allowed",
    rootCause:
      "A product category with child categories cannot be deleted directly. " +
      "the system enforces this FK constraint to prevent orphaning subcategories.",
    fix:
      "Delete child categories first (bottom-up), then delete the parent category. " +
      "Or skip deleting categories entirely and reuse existing ones.",
    involvedModules: ["product"],
    recoverable: true,
  },
  {
    name: "payment-provider-not-found",
    match: "Payment providers with ids",
    rootCause:
      "The region or store references a payment provider that is not installed or enabled. " +
      "The 'system' payment provider is only available when medusa-payment-stripe or similar is configured.",
    fix:
      "Do NOT include payment_providers field when creating a region. " +
      "Let the system use the default provider. Or install and configure a payment provider plugin.",
    involvedModules: ["payment", "region"],
    recoverable: true,
  },
  {
    name: "shipping-option-no-fulfillment",
    match: "Fulfillment provider with id",
    rootCause:
      "A shipping option references a fulfillment provider that doesn't exist. " +
      "Or the stock location doesn't have a fulfillment set linked to it.",
    fix:
      "Ensure the stock location has a fulfillment set. Run createLocationFulfillmentSetWorkflow " +
      "to auto-create one, or createFulfillmentSetsWorkflow + associateFulfillmentSetsWithLocationStep manually.",
    involvedModules: ["fulfillment", "stock-location"],
    recoverable: true,
  },
  {
    name: "query-non-existent-property",
    match: "Trying to query by not existing property",
    rootCause:
      "A graph() query filter references a field that doesn't exist on the MikroORM entity. " +
      "Common mistake: using 'handle' on ProductTag (only 'value' exists), or incorrect joiner config property names.",
    fix:
      "Check the MikroORM entity model for correct field names. ProductTag: use 'value' not 'handle'. " +
      "For link tables, use the joiner config property names (snake_case link fields).",
    involvedModules: ["any"],
    recoverable: true,
  },
  {
    name: "invalid-enum-value",
    match: /invalid input value for enum|DriverException|invalid input syntax/i,
    rootCause:
      "The LLM used a value that is not in the PostgreSQL ENUM or CHECK constraint for this column. " +
      "Common mistakes: using 'processing' (not a valid order status), 'active' for product (use 'published'), " +
      "'shipped' or 'paid' (these are computed fields, not stored enums). " +
      "The database rejects the query before it even runs because the value doesn't exist in the enum definition.",
    fix:
      "Check the Enum Values table in the system prompt. Replace the invalid value with one of the valid values. " +
      "If you don't need to filter by that field, omit it from the filters entirely. " +
      "Valid order statuses: pending, completed, draft, archived, canceled, requires_action. " +
      "Valid product statuses: draft, proposed, published, rejected. " +
      "Valid price_list statuses: active, draft. " +
      "Valid price_list types: sale, override.",
    involvedModules: ["any"],
    recoverable: true,
  },
  {
    name: "option-values-mismatch",
    match: "option values but there were",
    rootCause:
      "Product variants must specify values for ALL product options. " +
      "If a product has options [Size, Material, Grade] (3 options), " +
      "each variant must provide values for all 3, e.g. { 'Size': 'M8', 'Material': 'Steel', 'Grade': '8.8' }.",
    fix:
      "Either reduce product options to only the varying dimension (e.g., only 'Size'), " +
      "or add all option values to each variant. For a hardware store, the cleanest approach is " +
      "to have material/grade/origin as product-level attributes, and only size as a variant option.",
    involvedModules: ["product"],
    recoverable: true,
  },
]

// ── Medusa Enum Values ─────────────────────────────────────────────────

/**
 * All known Postgres enum / CHECK-constrained TEXT columns with their valid values.
 * The LLM MUST use these exact values when constructing filters or mutations.
 * Using any value not in these lists will cause PostgreSQL DriverException.
 */
export const MEDUSA_ENUM_VALUES: Record<string, { values: string[]; entity: string; field: string }> = {
  // True Postgres ENUM types
  order_status: {
    values: ["pending", "completed", "draft", "archived", "canceled", "requires_action"],
    entity: "order",
    field: "status",
  },
  return_status: {
    values: ["open", "requested", "received", "partially_received", "canceled"],
    entity: "return",
    field: "status",
  },
  order_claim_type: {
    values: ["refund", "replace"],
    entity: "order_claim",
    field: "type",
  },
  claim_reason: {
    values: ["missing_item", "wrong_item", "production_failure", "other"],
    entity: "order_claim_item",
    field: "reason",
  },
  // CHECK-constrained TEXT columns (not true Postgres ENUMs, but validated)
  product_status: {
    values: ["draft", "proposed", "published", "rejected"],
    entity: "product",
    field: "status",
  },
  payment_collection_status: {
    values: ["not_paid", "awaiting", "authorized", "partially_authorized", "canceled", "failed", "partially_captured", "completed"],
    entity: "payment_collection",
    field: "status",
  },
  payment_session_status: {
    values: ["authorized", "captured", "pending", "requires_more", "error", "canceled"],
    entity: "payment_session",
    field: "status",
  },
  price_list_status: {
    values: ["active", "draft"],
    entity: "price_list",
    field: "status",
  },
  price_list_type: {
    values: ["sale", "override"],
    entity: "price_list",
    field: "type",
  },
  shipping_option_price_type: {
    values: ["calculated", "flat"],
    entity: "shipping_option",
    field: "price_type",
  },
  geo_zone_type: {
    values: ["country", "province", "city", "zip"],
    entity: "geo_zone",
    field: "type",
  },
}

/**
 * Map from entity name to list of fields that have enum constraints.
 * Used by the filter validator to check filter values before querying.
 */
const ENTITY_ENUM_FIELDS: Record<string, Record<string, string[]>> = {}
for (const [key, def] of Object.entries(MEDUSA_ENUM_VALUES)) {
  if (!ENTITY_ENUM_FIELDS[def.entity]) {
    ENTITY_ENUM_FIELDS[def.entity] = {}
  }
  if (!ENTITY_ENUM_FIELDS[def.entity][def.field]) {
    ENTITY_ENUM_FIELDS[def.entity][def.field] = []
  }
  ENTITY_ENUM_FIELDS[def.entity][def.field].push(...def.values)
}

/**
 * Validate filter values against known enum constraints BEFORE hitting the database.
 * Returns a diagnosed result object if invalid values are found, null if everything is valid.
 * This prevents PostgreSQL DriverException: invalid input value for enum errors.
 */
export const validateFilterEnums = (
  entity: string,
  filters: Record<string, unknown>
): Record<string, unknown> | null => {
  const entityFields = ENTITY_ENUM_FIELDS[entity]
  if (!entityFields) return null

  for (const [field, validValues] of Object.entries(entityFields)) {
    const filterValue = filters[field]
    if (filterValue === undefined || filterValue === null) continue

    // Handle arrays like { status: ["pending", "processing"] }
    const valuesToCheck = Array.isArray(filterValue)
      ? filterValue.map((v) => String(v))
      : [String(filterValue)]

    for (const val of valuesToCheck) {
      if (!validValues.includes(val)) {
        return buildInvalidEnumResult(entity, field, val, validValues)
      }
    }
  }

  return null
}

const buildInvalidEnumResult = (
  entity: string,
  field: string,
  invalidValue: string,
  validValues: string[]
): Record<string, unknown> => {
  return {
    error: true,
    diagnosed: true,
    pattern: "invalid-enum-value",
    root_cause: `"${invalidValue}" is NOT a valid value for ${entity}.${field}. PostgreSQL uses a CHECK constraint or ENUM type that rejects unknown values. The LLM likely used a descriptive or non-existent status name instead of one of the valid constants.`,
    fix: `Change the filter value from "${invalidValue}" to one of the valid values: [${validValues.join(", ")}]. For list_orders, if you want to find all orders regardless of status, omit the status filter entirely.`,
    involved_modules: [entity],
    recoverable: true,
    instruction_to_model: `You used an invalid ${entity} ${field} filter value: "${invalidValue}". Valid ${entity} ${field} values are: ${validValues.join(", ")}. Correct your query to use one of these valid values, or remove the filter to see all records. Do NOT report this error — just fix your query and retry.`,
  }
}

/**
 * Get all Medusa enum values formatted for the system prompt.
 * The LLM references this to ensure it uses valid values in filters.
 */
export const getMedusaEnumContext = (): string => {
  const lines = [
    "## Enum & Status Values (USE THESE EXACT VALUES)",
    "",
    "CRITICAL: When filtering or mutating entities, ONLY use the exact values listed below.",
    "Using any other value (like 'processing', 'active', 'shipped', 'paid') will cause PostgreSQL DriverException.",
    "These are the ONLY valid values in the database schema:",
    "",
  ]

  for (const [key, def] of Object.entries(MEDUSA_ENUM_VALUES)) {
    lines.push(`### ${def.entity}.${def.field}`)
    lines.push(`Valid values: \`${def.values.join("`, `")}\``)
    lines.push("")
  }

  lines.push("### Common LLM Mistakes (values that DO NOT EXIST)")
  lines.push('- "processing" → use "pending" (order status)')
  lines.push('- "active" → use "published" (product) or "active" (price_list only)')
  lines.push('- "shipped" → fulfillment_status is computed, not stored directly')
  lines.push('- "paid" → payment_status is computed; use payment_collection.status values')
  lines.push('- "confirmed" → is not a valid value; use "completed"')
  lines.push('- "inactive" → does not exist; use "draft" (product) or "draft" (price_list)')
  lines.push("")

  return lines.join("\n")
}

// ── Additional context for the model ───────────────────────────────────

const MEDUSA_DATA_MODEL_CONTEXT = `
## Medusa Commerce — Data Model (critical for troubleshooting)

### Core Entity Relationships
- **Region** — has one currency, has many countries. One country = one region max.
- **Sales Channel** — distribution channel. Must be linked to Stock Locations.
- **Stock Location** — physical warehouse. Links to Sales Channel (many-to-many via sales_channel_location link table). Links to Fulfillment Set (via location_fulfillment_set link table).
- **Product** — has one Product Type, belongs to Categories (many-to-many), has many Variants.
- **Product Variant** — belongs to Product, has prices, links to Inventory Items (via variant_inventory_items link table).
- **Inventory Item** — links to Variant. Has Inventory Levels at Stock Locations.
- **Inventory Level** — belongs to Inventory Item + Stock Location. Has stocked_quantity, reserved_quantity.
- **Fulfillment Set** — belongs to Stock Location. Has Service Zones. Required for shipping.

### Order Creation Validation Chain
When creating an order, the engine runs confirmVariantInventoryWorkflow which checks:
1. For each line item's variant → find inventory_items via variant_inventory_items link
2. For each inventory_item → find inventory_levels (stocked - reserved quantity)
3. For each inventory_level → check its stock_location is linked to the order's sales_channel
4. If any step fails → error thrown

### Common Pitfalls
- Creating a stock location but not linking it to a sales channel
- Creating products but not creating inventory levels at any location
- Creating inventory levels at a location not linked to the sales channel
- SKU collisions: SKU must be globally unique (variant + inventory item)
- Deleting parent categories before children — must delete bottom-up
- Region country codes must be unique across all regions
`

// ── Diagnostic function ────────────────────────────────────────────────

/**
 * Diagnose a Medusa error and return a human-readable explanation
 * with root cause and concrete fix.
 */
export const diagnoseMedusaError = (error: unknown): string | null => {
  const message = extractErrorMessage(error)

  if (!message) return null

  for (const pattern of PATTERNS) {
    const matched =
      typeof pattern.match === "string"
        ? message.includes(pattern.match)
        : pattern.match.test(message)

    if (matched) {
      return formatDiagnosis(pattern, message)
    }
  }

  return null
}

/**
 * Check if an error is a known Medusa error (even if we don't have a deep
 * diagnosis, we can still give generic guidance).
 */
export const isMedusaError = (error: unknown): boolean => {
  const message = extractErrorMessage(error)
  if (!message) return false
  return message.includes("__isMedusaError") || message.includes("MedusaError")
}

/**
 * Get the Medusa data model context for inclusion in the system prompt.
 */
export const getMedusaDomainContext = (): string => {
  return MEDUSA_DATA_MODEL_CONTEXT
}

/**
 * Get all known error patterns as a summary for the system prompt.
 * Gives the model a quick reference to recognize and explain errors.
 */
export const getErrorPatternsSummary = (): string => {
  return PATTERNS.map(
    (p) =>
      `- **${p.name}**: ${p.rootCause.slice(0, 150)}... → ${p.fix.slice(0, 150)}...`
  ).join("\n")
}

// ── Helpers ────────────────────────────────────────────────────────────

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>
    return String(obj.message ?? obj.error ?? JSON.stringify(error))
  }
  return ""
}

const formatDiagnosis = (pattern: ErrorPattern, originalMessage: string): string => {
  return [
    `❌ KAMI ERROR: ${pattern.name}`,
    ``,
    `📋 Original error: ${originalMessage.slice(0, 300)}`,
    ``,
    `🔍 ROOT CAUSE:`,
    pattern.rootCause,
    ``,
    `🔧 FIX:`,
    pattern.fix,
    ``,
    `📦 Involved modules: ${pattern.involvedModules.join(", ")}`,
    `♻️ Recoverable: ${pattern.recoverable ? "Yes — the model can fix this" : "No — needs human intervention"}`,
  ].join("\n")
}
