import { objectSchema, graph, graphById, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerStoreTools = () => {
  registerTool({
    name: "get_store",
    toolset: "admin",
    description: "Get the store settings.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }),
    handler: async (args, ctx: KamiCtx) => {
      // If no ID is provided, try to get the first store
      if (args.id) {
        return await graphById(ctx, "store", args.id)
      }
      const result = await graph(ctx, "store", { limit: 1 })
      return result.data?.[0] ?? null
    },
  })

  registerTool({
    name: "update_store",
    toolset: "admin",
    description: "Update store settings.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateStoresWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateStoresWorkflow, {
        selector: { id: String(args.id) },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "list_carts",
    toolset: "admin",
    description: "List shopping carts.",
    risk: "read",
    schema: objectSchema({
      limit: { type: "number", description: "Maximum rows to return." },
      offset: { type: "number", description: "Rows to skip." },
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "cart", args),
  })

  registerTool({
    name: "get_cart",
    toolset: "admin",
    description: "Get a cart by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "cart", args.id),
  })
}
