import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerRegionTools = () => {
  registerTool({
    name: "list_regions",
    toolset: "admin",
    description: "List regions.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "region", args),
  })

  registerTool({
    name: "get_region",
    toolset: "admin",
    description: "Get a region by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "region", args.id),
  })

  registerTool({
    name: "create_region",
    toolset: "admin",
    description: "Create a region.",
    risk: "mutating",
    schema: objectSchema(
      { region: { type: "object" } },
      ["region"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createRegionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createRegionsWorkflow, {
        regions: [typedPayload(args, "region")],
      })
    },
  })

  registerTool({
    name: "update_region",
    toolset: "admin",
    description: "Update a region by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateRegionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateRegionsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_region",
    toolset: "admin",
    description: "Delete a region by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteRegionsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteRegionsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "region", deleted: true }
    },
  })
}
