import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateCreateDraftOrder = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const draft = args.draft_order
  if (!isObj(draft)) {
    return missingField(
      "create_draft_order",
      ["draft_order"],
      "create_draft_order requires a draft_order object.",
      "Provide a draft_order object."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(draft.email)) fields.push("draft_order.email")
  if (!isNonEmptyStr(draft.currency_code)) fields.push("draft_order.currency_code")
  const items = draft.items
  if (!Array.isArray(items) || items.length === 0) {
    fields.push("draft_order.items")
  } else {
    items.forEach((item, i) => {
      if (!isObj(item) || typeof item.quantity !== "number" || item.quantity <= 0)
        fields.push(`draft_order.items[${i}].quantity`)
      if (!isObj(item) || (!isNonEmptyStr(item.variant_id) && !isNonEmptyStr(item.title)))
        fields.push(`draft_order.items[${i}].variant_id`)
    })
  }
  if (!fields.length) return null
  return missingField(
    "create_draft_order",
    fields,
    "create_draft_order requires email, currency_code, and a non-empty items array.",
    "Add the missing fields. Each item needs a variant_id (or title) and a positive quantity."
  )
}

export const registerDraftOrderTools = () => {
  registerTool({
    name: "list_draft_orders",
    toolset: "admin",
    description: "List draft orders.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "draft_order", args),
  })

  registerTool({
    name: "get_draft_order",
    toolset: "admin",
    description: "Get a draft order by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "draft_order", args.id),
  })

  registerTool({
    name: "create_draft_order",
    toolset: "admin",
    description: "Create a draft order. Requires email, currency_code, and items.",
    risk: "mutating",
    schema: objectSchema(
      { draft_order: { type: "object" } },
      ["draft_order"]
    ),
    validate: validateCreateDraftOrder,
    handler: async (args, ctx: KamiCtx) => {
      // Draft orders are created via createOrderWorkflow with the draft flags
      // set — there is no dedicated create-draft-order workflow. Mirrors the
      // admin POST /draft-orders route.
      const { createOrderWorkflow } = await import("@medusajs/core-flows")
      const draft = typedPayload<Record<string, unknown>>(args, "draft_order")
      return await ctx.executor.runWorkflow(createOrderWorkflow, {
        ...draft,
        status: "draft",
        is_draft_order: true,
      })
    },
  })

  registerTool({
    name: "delete_draft_order",
    toolset: "admin",
    description: "Delete a draft order by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteDraftOrdersWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteDraftOrdersWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "draft_order", deleted: true }
    },
  })

  registerTool({
    name: "convert_draft_to_order",
    toolset: "admin",
    description: "Convert a draft order to a real order by ID.",
    risk: "mutating",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { convertDraftOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(convertDraftOrderWorkflow, { id: stringArg(args, "id") })
    },
  })
}
