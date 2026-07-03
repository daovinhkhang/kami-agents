import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateCreateSalesChannel = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const channel = args.sales_channel
  if (!isObj(channel) || !isNonEmptyStr(channel.name)) {
    return missingField(
      "create_sales_channel",
      ["sales_channel.name"],
      "create_sales_channel requires a sales_channel object with a non-empty name.",
      "Provide sales_channel.name (e.g. 'Webshop')."
    )
  }
  return null
}

export const registerSalesChannelTools = () => {
  registerTool({
    name: "list_sales_channels",
    toolset: "admin",
    description: "List sales channels.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "sales_channels", args),
  })

  registerTool({
    name: "get_sales_channel",
    toolset: "admin",
    description: "Get a sales channel by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "sales_channels", args.id),
  })

  registerTool({
    name: "create_sales_channel",
    toolset: "admin",
    description: "Create a sales channel.",
    risk: "mutating",
    schema: objectSchema(
      { sales_channel: { type: "object" } },
      ["sales_channel"]
    ),
    validate: validateCreateSalesChannel,
    handler: async (args, ctx: KamiCtx) => {
      const { createSalesChannelsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createSalesChannelsWorkflow, {
        sales_channels_data: [typedPayload(args, "sales_channel")],
      })
    },
  })

  registerTool({
    name: "update_sales_channel",
    toolset: "admin",
    description: "Update a sales channel by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateSalesChannelsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateSalesChannelsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_sales_channel",
    toolset: "admin",
    description: "Delete a sales channel by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteSalesChannelsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteSalesChannelsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "sales_channel", deleted: true }
    },
  })
}
