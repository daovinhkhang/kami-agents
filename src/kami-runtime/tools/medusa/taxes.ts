import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerTaxTools = () => {
  // --- Tax Rates ---

  registerTool({
    name: "list_tax_rates",
    toolset: "admin",
    description: "List tax rates.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "tax_rate", args),
  })

  registerTool({
    name: "get_tax_rate",
    toolset: "admin",
    description: "Get a tax rate by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "tax_rate", args.id),
  })

  registerTool({
    name: "create_tax_rate",
    toolset: "admin",
    description: "Create a tax rate.",
    risk: "mutating",
    schema: objectSchema(
      { tax_rate: { type: "object" } },
      ["tax_rate"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createTaxRatesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createTaxRatesWorkflow, {
        tax_rates: [typedPayload(args, "tax_rate")],
      })
    },
  })

  registerTool({
    name: "update_tax_rate",
    toolset: "admin",
    description: "Update a tax rate by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateTaxRatesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateTaxRatesWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_tax_rate",
    toolset: "admin",
    description: "Delete a tax rate by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteTaxRatesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteTaxRatesWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "tax_rate", deleted: true }
    },
  })

  // --- Tax Regions ---

  registerTool({
    name: "list_tax_regions",
    toolset: "admin",
    description: "List tax regions.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "tax_region", args),
  })

  registerTool({
    name: "create_tax_region",
    toolset: "admin",
    description: "Create a tax region.",
    risk: "mutating",
    schema: objectSchema(
      { tax_region: { type: "object" } },
      ["tax_region"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createTaxRegionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createTaxRegionsWorkflow, {
        tax_regions: [typedPayload(args, "tax_region")],
      })
    },
  })

  registerTool({
    name: "delete_tax_region",
    toolset: "admin",
    description: "Delete a tax region by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteTaxRegionsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteTaxRegionsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "tax_region", deleted: true }
    },
  })
}
