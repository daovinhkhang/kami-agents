import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

type CollectionPayload = Record<string, unknown>

const validateCreateCollection = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const collection = args.collection
  if (!isObj(collection) || !isNonEmptyStr(collection.title)) {
    return missingField(
      "create_collection",
      ["collection.title"],
      "create_collection requires a non-empty title.",
      "Provide collection.title as a non-empty string."
    )
  }
  return null
}

const validateUpdateCollection = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const update = args.update
  if (!isObj(update) || Object.keys(update).length === 0) {
    return missingField(
      "update_collection",
      ["update"],
      "update_collection received an empty update payload.",
      "Provide a non-empty update object with the fields to change."
    )
  }
  return null
}

export const registerCollectionTools = () => {
  registerTool({
    name: "list_collections",
    toolset: "admin",
    description: "List product collections.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "product_collection", args),
  })

  registerTool({
    name: "get_collection",
    toolset: "admin",
    description: "Get a product collection by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "product_collection", args.id),
  })

  registerTool({
    name: "create_collection",
    toolset: "admin",
    description: "Create a product collection.",
    risk: "mutating",
    schema: objectSchema(
      { collection: { type: "object" } },
      ["collection"]
    ),
    validate: validateCreateCollection,
    handler: async (args, ctx: KamiCtx) => {
      const { createCollectionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createCollectionsWorkflow, {
        collections: [typedPayload<CollectionPayload>(args, "collection")],
      })
    },
  })

  registerTool({
    name: "update_collection",
    toolset: "admin",
    description: "Update a product collection by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    validate: validateUpdateCollection,
    handler: async (args, ctx: KamiCtx) => {
      const { updateCollectionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateCollectionsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload<CollectionPayload>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_collection",
    toolset: "admin",
    description: "Delete a product collection by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteCollectionsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteCollectionsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "collection", deleted: true }
    },
  })
}
