import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateUpdateInventoryLevel = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const update = args.update
  if (!isObj(update) || Object.keys(update).length === 0) {
    return missingField(
      "update_inventory_level",
      ["update"],
      "update_inventory_level received an empty update payload.",
      "Provide a non-empty update with stocked_quantity and/or incoming_quantity."
    )
  }
  const fields: string[] = []
  for (const key of ["stocked_quantity", "incoming_quantity"]) {
    if (update[key] !== undefined) {
      const n = Number(update[key])
      if (!Number.isFinite(n) || n < 0) fields.push(`update.${key}`)
    }
  }
  if (!fields.length) return null
  return missingField(
    "update_inventory_level",
    fields,
    "update_inventory_level quantities must be non-negative numbers.",
    "Set stocked_quantity / incoming_quantity to a number >= 0."
  )
}

type InventoryPayload = Record<string, unknown>

export const registerInventoryTools = () => {
  // --- Inventory Items ---

  registerTool({
    name: "list_inventory",
    toolset: "admin",
    description: "List inventory items.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "inventory_item", args),
  })

  registerTool({
    name: "get_inventory_item",
    toolset: "admin",
    description: "Get an inventory item by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "inventory_item", args.id),
  })

  registerTool({
    name: "create_inventory_item",
    toolset: "admin",
    description: "Create an inventory item.",
    risk: "mutating",
    schema: objectSchema(
      { inventory_item: { type: "object" } },
      ["inventory_item"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createInventoryItemsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createInventoryItemsWorkflow, {
        items: [typedPayload<InventoryPayload>(args, "inventory_item")],
      })
    },
  })

  registerTool({
    name: "update_inventory_item",
    toolset: "admin",
    description: "Update an inventory item by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateInventoryItemsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateInventoryItemsWorkflow, {
        updates: [{ id: stringArg(args, "id"), ...typedPayload<InventoryPayload>(args, "update") }],
      })
    },
  })

  registerTool({
    name: "delete_inventory_item",
    toolset: "admin",
    description: "Delete an inventory item by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteInventoryItemWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteInventoryItemWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "inventory_item", deleted: true }
    },
  })

  // --- Inventory Levels ---

  registerTool({
    name: "list_inventory_levels",
    toolset: "admin",
    description: "List inventory levels (stock at locations).",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "inventory_level", args),
  })

  registerTool({
    name: "create_inventory_level",
    toolset: "admin",
    description: "Create an inventory level for a location.",
    risk: "mutating",
    schema: objectSchema(
      { inventory_level: { type: "object" } },
      ["inventory_level"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createInventoryLevelsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createInventoryLevelsWorkflow, {
        inventory_levels: [typedPayload<InventoryPayload>(args, "inventory_level")],
      })
    },
  })

  registerTool({
    name: "update_inventory_level",
    toolset: "admin",
    description: "Update an inventory level by inventory item ID and location ID.",
    risk: "mutating",
    schema: objectSchema(
      {
        inventory_item_id: { type: "string" },
        location_id: { type: "string" },
        update: { type: "object" },
      },
      ["inventory_item_id", "location_id", "update"]
    ),
    validate: validateUpdateInventoryLevel,
    handler: async (args, ctx: KamiCtx) => {
      const { updateInventoryLevelsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateInventoryLevelsWorkflow, {
        updates: [{
          inventory_item_id: stringArg(args, "inventory_item_id"),
          location_id: stringArg(args, "location_id"),
          ...typedPayload<InventoryPayload>(args, "update"),
        }],
      })
    },
  })

  registerTool({
    name: "delete_inventory_level",
    toolset: "admin",
    description: "Delete an inventory level by inventory item ID and location ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema(
      { inventory_item_id: { type: "string" }, location_id: { type: "string" } },
      ["inventory_item_id", "location_id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteInventoryLevelsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteInventoryLevelsWorkflow, { ids: [stringArg(args, "inventory_item_id")] })
      return { inventory_item_id: args.inventory_item_id, location_id: args.location_id, object: "inventory_level", deleted: true }
    },
  })

  // --- Reservations ---

  registerTool({
    name: "list_reservations",
    toolset: "admin",
    description: "List inventory reservations.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "reservation", args),
  })

  registerTool({
    name: "create_reservation",
    toolset: "admin",
    description: "Create an inventory reservation for a line item.",
    risk: "mutating",
    schema: objectSchema(
      { reservation: { type: "object" } },
      ["reservation"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createReservationsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createReservationsWorkflow, {
        reservations: [typedPayload<InventoryPayload>(args, "reservation")],
      })
    },
  })

  registerTool({
    name: "delete_reservation",
    toolset: "admin",
    description: "Delete an inventory reservation by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteReservationsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteReservationsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "reservation", deleted: true }
    },
  })
}
