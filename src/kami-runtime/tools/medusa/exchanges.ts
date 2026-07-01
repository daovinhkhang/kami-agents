import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerExchangeTools = () => {
  registerTool({
    name: "list_exchanges",
    toolset: "admin",
    description: "List order exchanges.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "order_exchange", args),
  })

  registerTool({
    name: "get_exchange",
    toolset: "admin",
    description: "Get an order exchange by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "order_exchange", args.id),
  })

  registerTool({
    name: "create_exchange",
    toolset: "admin",
    description: "Begin an exchange on an order. Requires order_id and items to exchange.",
    risk: "mutating",
    schema: objectSchema(
      { exchange: { type: "object" } },
      ["exchange"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { beginExchangeOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(beginExchangeOrderWorkflow, typedPayload(args, "exchange"))
    },
  })

  registerTool({
    name: "cancel_exchange",
    toolset: "admin",
    description: "Cancel an order exchange by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { cancelOrderExchangeWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(cancelOrderExchangeWorkflow, { id: stringArg(args, "id") })
      return { id: args.id, object: "exchange", canceled: true }
    },
  })
}
