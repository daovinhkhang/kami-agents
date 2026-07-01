import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import { Modules } from "@medusajs/framework/utils"
import type { KamiCtx } from "../../types"

const validateCreateStockLocation = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const location = args.stock_location
  if (!isObj(location) || !isNonEmptyStr(location.name)) {
    return missingField(
      "create_stock_location",
      ["stock_location.name"],
      "create_stock_location requires a non-empty name.",
      "Provide stock_location.name as a non-empty string."
    )
  }
  return null
}

type StockLocationPayload = Record<string, unknown>

const buildFulfillmentProviderLinks = (
  stockLocationId: string,
  fulfillmentProviderIds: string[]
) =>
  fulfillmentProviderIds.map((fulfillmentProviderId) => ({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: fulfillmentProviderId,
    },
  }))

export const registerStockLocationTools = () => {
  registerTool({
    name: "list_stock_locations",
    toolset: "admin",
    description: "List stock locations.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "stock_location", args),
  })

  registerTool({
    name: "get_stock_location",
    toolset: "admin",
    description: "Get a stock location by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "stock_location", args.id),
  })

  registerTool({
    name: "create_fulfillment_set",
    toolset: "admin",
    description:
      "Create and attach a fulfillment set to a stock location. Required before creating service zones and shipping options. Input: { location_id, fulfillment_set: { name, type } }. Use type 'shipping' for delivery and 'pickup' for pickup.",
    risk: "mutating",
    schema: objectSchema(
      {
        location_id: { type: "string" },
        fulfillment_set: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["shipping", "pickup"] },
          },
          required: ["name", "type"],
          additionalProperties: false,
        },
      },
      ["location_id", "fulfillment_set"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createLocationFulfillmentSetWorkflow } = await import("@medusajs/core-flows")
      const fulfillmentSet = typedPayload<StockLocationPayload>(args, "fulfillment_set")

      await ctx.executor.runWorkflow(createLocationFulfillmentSetWorkflow, {
        location_id: stringArg(args, "location_id"),
        fulfillment_set_data: {
          name: String(fulfillmentSet.name),
          type: String(fulfillmentSet.type),
        },
      })

      return await graphById(ctx, "stock_location", args.location_id)
    },
  })

  registerTool({
    name: "update_stock_location_fulfillment_providers",
    toolset: "admin",
    description:
      "Link or unlink fulfillment providers for a stock location. Required before creating shipping options for a service zone. Input: { location_id, add?: [provider_id], remove?: [provider_id] }.",
    risk: "mutating",
    schema: objectSchema(
      {
        location_id: { type: "string" },
        add: { type: "array", items: { type: "string" } },
        remove: { type: "array", items: { type: "string" } },
      },
      ["location_id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { batchLinksWorkflow } = await import("@medusajs/core-flows")
      const locationId = stringArg(args, "location_id")
      const add = Array.isArray(args.add) ? args.add.map(String).filter(Boolean) : []
      const remove = Array.isArray(args.remove) ? args.remove.map(String).filter(Boolean) : []

      await ctx.executor.runWorkflow(batchLinksWorkflow, {
        create: buildFulfillmentProviderLinks(locationId, add),
        delete: buildFulfillmentProviderLinks(locationId, remove),
      })

      return await graphById(ctx, "stock_location", locationId)
    },
  })

  registerTool({
    name: "create_stock_location",
    toolset: "admin",
    description: "Create a stock location.",
    risk: "mutating",
    schema: objectSchema(
      { stock_location: { type: "object" } },
      ["stock_location"]
    ),
    validate: validateCreateStockLocation,
    handler: async (args, ctx: KamiCtx) => {
      const { createStockLocationsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createStockLocationsWorkflow, {
        locations: [typedPayload<StockLocationPayload>(args, "stock_location")],
      })
    },
  })

  registerTool({
    name: "update_stock_location",
    toolset: "admin",
    description: "Update a stock location by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateStockLocationsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateStockLocationsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload<StockLocationPayload>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_stock_location",
    toolset: "admin",
    description: "Delete a stock location by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteStockLocationsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteStockLocationsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "stock_location", deleted: true }
    },
  })
}
