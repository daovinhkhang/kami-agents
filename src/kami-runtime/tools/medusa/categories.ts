import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateCreateCategory = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const category = args.category
  if (!isObj(category) || !isNonEmptyStr(category.name)) {
    return missingField(
      "create_category",
      ["category.name"],
      "create_category requires a non-empty name.",
      "Provide category.name as a non-empty string."
    )
  }
  return null
}

const validateUpdateCategory = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const update = args.update
  if (!isObj(update) || Object.keys(update).length === 0) {
    return missingField(
      "update_category",
      ["update"],
      "update_category received an empty update payload.",
      "Provide a non-empty update object with the fields to change."
    )
  }
  return null
}

export const registerCategoryTools = () => {
  registerTool({
    name: "list_categories",
    toolset: "admin",
    description: "List product categories.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "product_category", args),
  })

  registerTool({
    name: "get_category",
    toolset: "admin",
    description: "Get a product category by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "product_category", args.id),
  })

  registerTool({
    name: "create_category",
    toolset: "admin",
    description: "Create a product category.",
    risk: "mutating",
    schema: objectSchema(
      { category: { type: "object" } },
      ["category"]
    ),
    validate: validateCreateCategory,
    handler: async (args, ctx: KamiCtx) => {
      const { createProductCategoriesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createProductCategoriesWorkflow, {
        product_categories: [typedPayload(args, "category")],
      })
    },
  })

  registerTool({
    name: "update_category",
    toolset: "admin",
    description: "Update a product category by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    validate: validateUpdateCategory,
    handler: async (args, ctx: KamiCtx) => {
      const { updateProductCategoriesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateProductCategoriesWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_category",
    toolset: "admin",
    description: "Delete a product category by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteProductCategoriesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteProductCategoriesWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "category", deleted: true }
    },
  })
}
