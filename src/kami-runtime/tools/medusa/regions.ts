import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const validateCreateRegion = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const region = args.region
  if (!isObj(region)) {
    return missingField(
      "create_region",
      ["region"],
      "create_region requires a region object.",
      "Provide a region object with name and currency_code."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(region.name)) fields.push("region.name")
  if (!isNonEmptyStr(region.currency_code)) fields.push("region.currency_code")
  if (!fields.length) return null
  return missingField(
    "create_region",
    fields,
    "create_region requires both a name and a currency_code.",
    "Set region.name and region.currency_code (e.g. 'usd', 'vnd')."
  )
}

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
    validate: validateCreateRegion,
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
