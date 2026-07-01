import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerCustomerGroupTools = () => {
  registerTool({
    name: "list_customer_groups",
    toolset: "admin",
    description: "List customer groups.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "customer_group", args),
  })

  registerTool({
    name: "get_customer_group",
    toolset: "admin",
    description: "Get a customer group by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "customer_group", args.id),
  })

  registerTool({
    name: "create_customer_group",
    toolset: "admin",
    description: "Create a customer group.",
    risk: "mutating",
    schema: objectSchema(
      { customer_group: { type: "object" } },
      ["customer_group"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createCustomerGroupsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createCustomerGroupsWorkflow, {
        customer_groups: [typedPayload(args, "customer_group")],
      })
    },
  })

  registerTool({
    name: "update_customer_group",
    toolset: "admin",
    description: "Update a customer group by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateCustomerGroupsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateCustomerGroupsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_customer_group",
    toolset: "admin",
    description: "Delete a customer group by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteCustomerGroupsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteCustomerGroupsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "customer_group", deleted: true }
    },
  })
}
