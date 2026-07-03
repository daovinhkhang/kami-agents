import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateCreateReturn = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const ret = args.return
  if (!isObj(ret) || !isNonEmptyStr(ret.order_id)) {
    return missingField(
      "create_return",
      ["return.order_id"],
      "create_return requires a return object with a non-empty order_id.",
      "Provide return.order_id. List the order first if you do not know its id."
    )
  }
  return null
}

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
    validate: validateCreateReturn,
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
