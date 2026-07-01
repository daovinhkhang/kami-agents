import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerReturnTools = () => {
  registerTool({
    name: "list_returns",
    toolset: "admin",
    description: "List order returns.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "return", args),
  })

  registerTool({
    name: "get_return",
    toolset: "admin",
    description: "Get an order return by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "return", args.id),
  })

  registerTool({
    name: "create_return",
    toolset: "admin",
    description: "Begin a return on an order. Requires order_id and items to return.",
    risk: "mutating",
    schema: objectSchema(
      { return: { type: "object" } },
      ["return"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { beginReturnOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(beginReturnOrderWorkflow, typedPayload(args, "return"))
    },
  })

  registerTool({
    name: "cancel_return",
    toolset: "admin",
    description: "Cancel an order return by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { cancelReturnWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(cancelReturnWorkflow, { return_id: stringArg(args, "id") })
      return { id: args.id, object: "return", canceled: true }
    },
  })

  registerTool({
    name: "list_return_reasons",
    toolset: "admin",
    description: "List return reasons.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "return_reason", args),
  })
}
