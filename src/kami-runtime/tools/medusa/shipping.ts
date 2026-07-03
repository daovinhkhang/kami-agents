import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

type ShippingPayload = Record<string, unknown>

const validateCreateShippingOption = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const option = args.shipping_option
  if (!isObj(option)) {
    return missingField(
      "create_shipping_option",
      ["shipping_option"],
      "create_shipping_option requires a shipping_option object.",
      "Provide a shipping_option object with service_zone_id, shipping_profile_id, provider_id and price_type."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(option.service_zone_id)) fields.push("shipping_option.service_zone_id")
  if (!isNonEmptyStr(option.shipping_profile_id)) fields.push("shipping_option.shipping_profile_id")
  if (!isNonEmptyStr(option.provider_id)) fields.push("shipping_option.provider_id")
  if (!isNonEmptyStr(option.price_type)) fields.push("shipping_option.price_type")
  if (!fields.length) return null
  return missingField(
    "create_shipping_option",
    fields,
    "create_shipping_option requires service_zone_id, shipping_profile_id, provider_id and price_type.",
    "Run list_fulfillment_providers, create_service_zone and list_shipping_profiles first to obtain these ids."
  )
}

const validateCreateShippingProfile = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const profile = args.shipping_profile
  if (!isObj(profile) || !isNonEmptyStr(profile.name)) {
    return missingField(
      "create_shipping_profile",
      ["shipping_profile.name"],
      "create_shipping_profile requires a shipping_profile object with a non-empty name.",
      "Provide shipping_profile.name (e.g. 'Default')."
    )
  }
  return null
}

export const registerShippingTools = () => {
  // --- Shipping Options ---

  registerTool({
    name: "list_shipping_options",
    toolset: "admin",
    description: "List shipping options.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "shipping_option", args),
  })

  registerTool({
    name: "get_shipping_option",
    toolset: "admin",
    description: "Get a shipping option by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "shipping_option", args.id),
  })

  registerTool({
    name: "create_shipping_option",
    toolset: "admin",
    description:
      "Create a shipping option. Requires service_zone_id, shipping_profile_id, provider_id, price_type, and either prices for flat rate or provider data for calculated rates. Run list_fulfillment_providers, update_stock_location_fulfillment_providers, create_fulfillment_set, and create_service_zone first if shipping infrastructure is missing.",
    risk: "mutating",
    schema: objectSchema(
      { shipping_option: { type: "object" } },
      ["shipping_option"]
    ),
    validate: validateCreateShippingOption,
    handler: async (args, ctx: KamiCtx) => {
      const { createShippingOptionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createShippingOptionsWorkflow, [
        typedPayload<ShippingPayload>(args, "shipping_option"),
      ])
    },
  })

  registerTool({
    name: "update_shipping_option",
    toolset: "admin",
    description: "Update a shipping option by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateShippingOptionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateShippingOptionsWorkflow, {
        id: stringArg(args, "id"),
        ...typedPayload<ShippingPayload>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_shipping_option",
    toolset: "admin",
    description: "Delete a shipping option by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteShippingOptionsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteShippingOptionsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "shipping_option", deleted: true }
    },
  })

  // --- Shipping Profiles ---

  registerTool({
    name: "list_shipping_profiles",
    toolset: "admin",
    description: "List shipping profiles.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "shipping_profile", args),
  })

  registerTool({
    name: "create_shipping_profile",
    toolset: "admin",
    description: "Create a shipping profile.",
    risk: "mutating",
    schema: objectSchema(
      { shipping_profile: { type: "object" } },
      ["shipping_profile"]
    ),
    validate: validateCreateShippingProfile,
    handler: async (args, ctx: KamiCtx) => {
      const { createShippingProfilesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createShippingProfilesWorkflow, {
        data: [typedPayload<ShippingPayload>(args, "shipping_profile")],
      })
    },
  })

  registerTool({
    name: "delete_shipping_profile",
    toolset: "admin",
    description: "Delete a shipping profile by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteShippingProfileWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteShippingProfileWorkflow, { id: stringArg(args, "id") })
      return { id: args.id, object: "shipping_profile", deleted: true }
    },
  })
}
