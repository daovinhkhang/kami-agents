import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import { Modules } from "@medusajs/framework/utils"
import type { KamiCtx } from "../../types"

const validateCreateFulfillment = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const items = args.items
  if (!Array.isArray(items) || items.length === 0) {
    return missingField(
      "create_fulfillment",
      ["items"],
      "create_fulfillment requires a non-empty items array.",
      "Call get_order first to read line item IDs (items.id, e.g. orli_...), then pass them with quantities."
    )
  }
  const fields: string[] = []
  items.forEach((item, i) => {
    if (!isObj(item) || !isNonEmptyStr(item.id))
      fields.push(`items[${i}].id`)
    if (!isObj(item) || typeof item.quantity !== "number" || item.quantity <= 0)
      fields.push(`items[${i}].quantity`)
  })
  if (!fields.length) return null
  return missingField(
    "create_fulfillment",
    fields,
    "create_fulfillment items must each have a line item id and a positive quantity.",
    "Use the order's line item id (orli_...) and a quantity > 0."
  )
}

type ServiceZonePayload = Record<string, unknown>

export const registerFulfillmentTools = () => {
  registerTool({
    name: "list_fulfillment_sets",
    toolset: "admin",
    description: "List fulfillment sets. Use this before creating service zones.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "fulfillment_set", args),
  })

  registerTool({
    name: "get_fulfillment_set",
    toolset: "admin",
    description: "Get a fulfillment set by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "fulfillment_set", args.id),
  })

  registerTool({
    name: "list_service_zones",
    toolset: "admin",
    description: "List service zones for fulfillment sets.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "service_zone", args),
  })

  registerTool({
    name: "get_service_zone",
    toolset: "admin",
    description: "Get a service zone by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "service_zone", args.id),
  })

  registerTool({
    name: "create_service_zone",
    toolset: "admin",
    description:
      "Create a service zone under a fulfillment set. Required before creating shipping options. Input: { fulfillment_set_id, service_zone: { name, geo_zones } }. For Vietnam, use geo_zones: [{ type: 'country', country_code: 'vn' }].",
    risk: "mutating",
    schema: objectSchema(
      {
        fulfillment_set_id: { type: "string" },
        service_zone: {
          type: "object",
          properties: {
            name: { type: "string" },
            geo_zones: {
              type: "array",
              items: { type: "object" },
            },
          },
          required: ["name"],
          additionalProperties: true,
        },
      },
      ["fulfillment_set_id", "service_zone"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createServiceZonesWorkflow } = await import("@medusajs/core-flows")
      const serviceZone = typedPayload<ServiceZonePayload>(args, "service_zone")
      const result = await ctx.executor.runWorkflow(createServiceZonesWorkflow, {
        data: [
          {
            name: String(serviceZone.name),
            fulfillment_set_id: stringArg(args, "fulfillment_set_id"),
            geo_zones: Array.isArray(serviceZone.geo_zones)
              ? serviceZone.geo_zones
              : [],
          },
        ],
      })

      return Array.isArray(result) ? result[0] : result
    },
  })

  registerTool({
    name: "list_fulfillment_providers",
    toolset: "admin",
    description: "List installed fulfillment providers. Use the provider id when linking a provider to a stock location and creating shipping options.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "fulfillment_provider", args),
  })

  registerTool({
    name: "list_fulfillment_provider_options",
    toolset: "admin",
    description: "List available fulfillment options for a fulfillment provider. Use this to choose shipping option data.",
    risk: "read",
    schema: objectSchema({ provider_id: { type: "string" } }, ["provider_id"]),
    handler: async (args, ctx: KamiCtx) => {
      const fulfillment = ctx.executor.resolveModule<any>(Modules.FULFILLMENT)
      const options = await fulfillment.retrieveFulfillmentOptions(stringArg(args, "provider_id"))
      return { provider_id: args.provider_id, options }
    },
  })

  registerTool({
    name: "list_fulfillments",
    toolset: "admin",
    description: "List fulfillments.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "fulfillment", args),
  })

  registerTool({
    name: "get_fulfillment",
    toolset: "admin",
    description: "Get a fulfillment by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "fulfillment", args.id),
  })

  registerTool({
    name: "create_fulfillment",
    toolset: "admin",
    description:
      "Create an order fulfillment using createOrderFulfillmentWorkflow. " +
      "Input: { order_id, items: [{ id, quantity }], location_id?, shipping_option_id? }. " +
      "items[].id must be the order line item id (orli_...) from get_order fields items.id, not a variant id or product id. " +
      "location_id is the stock location id (sloc_...); omit it if the workflow can infer it from the shipping option. " +
      "shipping_option_id is required when the order has no shipping_methods yet. " +
      "Example: { order_id: 'order_123', items: [{ id: 'orli_456', quantity: 100 }] }",
    risk: "mutating",
    schema: objectSchema(
      {
        order_id: { type: "string" },
        items: {
          type: "array",
          description: "Mảng các line items cần giao, mỗi item có id (line item id) và quantity.",
          items: { type: "object" },
        },
        location_id: { type: "string" },
        shipping_option_id: { type: "string" },
      },
      ["order_id", "items"]
    ),
    validate: validateCreateFulfillment,
    handler: async (args, ctx: KamiCtx) => {
      const { createOrderFulfillmentWorkflow } = await import("@medusajs/core-flows")
      const order_id = stringArg(args, "order_id")
      const items = Array.isArray(args.items) ? args.items : []

      if (!items.length) {
        throw new Error(
          "create_fulfillment requires at least one item. " +
            "Call get_order first to read line item IDs from items.id, then pass them with quantities. " +
            "Example: { order_id, items: [{ id: 'orli_xxx', quantity: 100 }] }"
        )
      }

      const input: Record<string, unknown> = {
        order_id,
        items: items.map((it: any) => ({
          id: String(it.id),
          quantity: Number(it.quantity),
        })),
      }
      if (typeof args.location_id === "string" && args.location_id) {
        input.location_id = args.location_id
      }
      if (typeof args.shipping_option_id === "string" && args.shipping_option_id) {
        input.shipping_option_id = args.shipping_option_id
      }

      return await ctx.executor.runWorkflow(createOrderFulfillmentWorkflow, input)
    },
  })

  registerTool({
    name: "cancel_fulfillment",
    toolset: "admin",
    description: "Cancel a fulfillment by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { cancelFulfillmentWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(cancelFulfillmentWorkflow, { id: stringArg(args, "id") })
      return { id: args.id, object: "fulfillment", canceled: true }
    },
  })

  registerTool({
    name: "mark_fulfillment_delivered",
    toolset: "admin",
    description: "Mark a fulfillment as delivered by ID.",
    risk: "mutating",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { markFulfillmentAsDeliveredWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(markFulfillmentAsDeliveredWorkflow, { id: stringArg(args, "id") })
    },
  })

  registerTool({
    name: "create_shipment",
    toolset: "admin",
    description: "Create a shipment for a fulfillment. Requires fulfillment_id and tracking details.",
    risk: "mutating",
    schema: objectSchema(
      { shipment: { type: "object" } },
      ["shipment"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createShipmentWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createShipmentWorkflow, typedPayload(args, "shipment"))
    },
  })
}
