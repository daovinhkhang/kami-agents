import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sanitizeSchema } from "../schema-sanitizer"
import type { KamiCtx } from "../../types"
import type { ArgValidationResult } from "../registry"
import { validateFilterEnums, MEDUSA_ENUM_VALUES } from "./error-diagnostics"

/** Shared helpers used across all Medusa commerce tool files. */

export const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
) =>
  sanitizeSchema({
    type: "object",
    properties,
    required,
    additionalProperties: false,
  })

export const pagination = {
  limit: { type: "number", description: "Maximum rows to return." },
  offset: { type: "number", description: "Rows to skip." },
}

export const defaultFields: Record<string, string[]> = {
  product: [
    "id", "title", "handle", "status", "thumbnail", "created_at", "updated_at",
    "variants.id", "variants.title", "variants.sku",
  ],
  order: [
    "id", "display_id", "status", "email", "currency_code", "total",
    "fulfillment_status", "payment_status",
    "created_at", "updated_at",
    // Line items — cần để fulfill đơn, biết số lượng đã giao/chưa giao
    "items.id", "items.title", "items.quantity", "items.unit_price", "items.requires_shipping",
    "items.variant.sku", "items.variant.title",
    "items.detail.fulfilled_quantity", "items.detail.shipped_quantity",
    // Địa chỉ giao hàng
    "shipping_address.address_1", "shipping_address.city", "shipping_address.country_code", "shipping_address.phone",
    // Payment collection liên kết với đơn
    "payment_collections.id", "payment_collections.status", "payment_collections.amount",
  ],
  customer: [
    "id", "email", "first_name", "last_name", "phone", "created_at", "updated_at",
  ],
  inventory_item: [
    "id", "sku", "title", "description", "requires_shipping", "created_at", "updated_at",
  ],
  price_list: ["id", "title", "description", "status", "type"],
  promotion: ["id", "code", "type", "status", "campaign_id"],
  fulfillment: ["id", "location_id", "provider_id", "created_at"],
  product_collection: ["id", "title", "handle", "metadata", "created_at", "updated_at"],
  product_category: ["id", "name", "handle", "description", "rank", "metadata", "created_at", "updated_at"],
  inventory_level: ["id", "inventory_item_id", "location_id", "stocked_quantity", "reserved_quantity", "incoming_quantity", "created_at", "updated_at"],
  reservation: ["id", "line_item_id", "inventory_item_id", "location_id", "quantity", "created_at"],
  region: ["id", "name", "currency_code", "automatic_taxes", "metadata", "created_at", "updated_at"],
  sales_channels: ["id", "name", "description", "is_disabled", "metadata", "created_at", "updated_at"],
  stock_location: [
    "id", "name", "metadata", "address.*", "created_at", "updated_at",
    "fulfillment_sets.id", "fulfillment_sets.name", "fulfillment_sets.type",
    "fulfillment_sets.service_zones.id", "fulfillment_sets.service_zones.name",
    "fulfillment_providers.id", "fulfillment_providers.is_enabled",
  ],
  fulfillment_set: ["id", "name", "type", "metadata", "service_zones.id", "service_zones.name", "created_at", "updated_at"],
  service_zone: ["id", "name", "fulfillment_set_id", "geo_zones.*", "shipping_options.id", "shipping_options.name", "created_at", "updated_at"],
  fulfillment_provider: ["id", "is_enabled"],
  shipping_option: ["id", "name", "price_type", "amount", "is_tax_inclusive", "service_zone_id", "shipping_profile_id", "provider_id", "data", "metadata", "created_at", "updated_at"],
  shipping_profile: ["id", "name", "type", "metadata", "created_at", "updated_at"],
  payment: ["id", "amount", "currency_code", "status", "payment_session_id", "created_at"],
  payment_collection: ["id", "amount", "currency_code", "status", "created_at"],
  order_claim: ["id", "type", "order_id", "return_id", "created_at"],
  order_exchange: ["id", "order_id", "return_id", "created_at"],
  return: ["id", "status", "order_id", "created_at"],
  return_reason: ["id", "value", "label", "description", "metadata", "created_at", "updated_at"],
  draft_order: ["id", "display_id", "status", "email", "currency_code", "created_at"],
  customer_group: ["id", "name", "metadata", "created_at", "updated_at"],
  tax_rate: ["id", "name", "rate", "code", "tax_region_id", "created_at", "updated_at"],
  tax_region: ["id", "country_code", "province_code", "metadata", "created_at", "updated_at"],
  user: ["id", "first_name", "last_name", "email", "avatar_url", "metadata", "created_at", "updated_at"],
  invite: ["id", "email", "accepted", "token", "expires_at", "metadata", "created_at", "updated_at"],
  rbac_role: ["id", "name", "metadata", "created_at", "updated_at"],
  api_key: ["id", "title", "type", "revoked_at", "last_used_at", "created_at", "updated_at"],
  store: ["id", "name", "default_sales_channel_id", "default_region_id", "default_location_id", "metadata", "created_at", "updated_at"],
  cart: ["id", "region_id", "customer_id", "sales_channel_id", "email", "currency_code", "metadata", "completed_at", "created_at", "updated_at"],
  campaign: ["id", "name", "description", "campaign_identifier", "starts_at", "ends_at", "created_at"],
}

export const graph = async (
  ctx: KamiCtx,
  entity: string,
  args: Record<string, unknown> = {}
) => {
  const query = ctx.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const limit = Math.min(Number(args.limit ?? 20), 100)
  const offset = Number(args.offset ?? 0)
  const fields = (args.fields as string[] | undefined) ?? defaultFields[entity]
  const filters = (args.filters as Record<string, unknown> | undefined) ?? {}

  // ── Pre-call filter validation: catch invalid enum values BEFORE PostgreSQL rejects them ──
  const enumError = validateFilterEnums(entity, filters)
  if (enumError) {
    // Return a diagnostic result directly instead of letting PostgreSQL throw DriverException.
    // The model will see the diagnosis and know to correct the filter value and retry.
    return enumError
  }

  return await query.graph({
    entity,
    fields,
    filters,
    pagination: {
      take: limit,
      skip: offset,
    },
  })
}

export const graphById = async (ctx: KamiCtx, entity: string, id: unknown) => {
  const result = await graph(ctx, entity, {
    filters: { id },
    limit: 1,
  })
  return result.data?.[0] ?? null
}

export const inputPayload = (args: Record<string, unknown>, key: string) => {
  return (args[key] as Record<string, unknown> | undefined) ?? args
}

export const typedPayload = <T = Record<string, unknown>>(args: Record<string, unknown>, key: string): T => {
  return inputPayload(args, key) as T
}

export const stringArg = (args: Record<string, unknown>, key: string) => {
  const value = args[key]
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Tool argument "${key}" must be a non-empty string`)
  }
  return value
}

// ── Layer-2 validation helpers (used by per-tool `validate` hooks) ──────

export const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

export const isNonEmptyStr = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0

export const asStr = (v: unknown): string => (typeof v === "string" ? v : "")

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const isValidEmail = (v: unknown): boolean =>
  typeof v === "string" && EMAIL_RE.test(v.trim())

/** Look up the valid enum values for an entity.field (e.g. "product","status"). */
export const enumValuesFor = (
  entity: string,
  field: string
): string[] | null => {
  for (const def of Object.values(MEDUSA_ENUM_VALUES)) {
    if (def.entity === entity && def.field === field) {
      return def.values
    }
  }
  return null
}

/** Build a structured "missing/invalid required field" diagnostic. */
export const missingField = (
  tool: string,
  fields: string[],
  rootCause: string,
  fix: string
): ArgValidationResult => ({
  error: true,
  diagnosed: true,
  pattern: "missing-required-field",
  root_cause: rootCause,
  fix,
  recoverable: true,
  fields,
  instruction_to_model:
    `Your tool call "${tool}" was REJECTED before execution. ` +
    `Fix the field(s) listed above, or call ask_user to get the value from the user instead of guessing. ` +
    `Do NOT repeat the same malformed call.`,
})
