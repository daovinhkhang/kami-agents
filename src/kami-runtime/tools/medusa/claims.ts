import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerClaimTools = () => {
  registerTool({
    name: "list_claims",
    toolset: "admin",
    description: "List order claims.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "order_claim", args),
  })

  registerTool({
    name: "get_claim",
    toolset: "admin",
    description: "Get an order claim by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "order_claim", args.id),
  })

  registerTool({
    name: "create_claim",
    toolset: "admin",
    description: "Begin a claim on an order. Requires order_id and a reason.",
    risk: "mutating",
    schema: objectSchema(
      { claim: { type: "object" } },
      ["claim"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { beginClaimOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(beginClaimOrderWorkflow, typedPayload(args, "claim"))
    },
  })

  registerTool({
    name: "cancel_claim",
    toolset: "admin",
    description: "Cancel an order claim by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { cancelOrderClaimWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(cancelOrderClaimWorkflow, { id: stringArg(args, "id") })
      return { id: args.id, object: "claim", canceled: true }
    },
  })
}
