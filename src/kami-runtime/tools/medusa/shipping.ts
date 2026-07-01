import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

type ShippingPayload = Record<string, unknown>

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
