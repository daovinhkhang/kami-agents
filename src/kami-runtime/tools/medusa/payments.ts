import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const registerPaymentTools = () => {
  // --- Payments ---

  registerTool({
    name: "list_payments",
    toolset: "admin",
    description: "List payments.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "payment", args),
  })

  registerTool({
    name: "get_payment",
    toolset: "admin",
    description: "Get a payment by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "payment", args.id),
  })

  registerTool({
    name: "capture_payment",
    toolset: "admin",
    description: "Capture a payment by payment ID.",
    risk: "mutating",
    schema: objectSchema({ payment_id: { type: "string" } }, ["payment_id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { capturePaymentWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(capturePaymentWorkflow, {
        payment_id: stringArg(args, "payment_id"),
      })
    },
  })

  registerTool({
    name: "refund_payment",
    toolset: "admin",
    description: "Refund a payment by payment ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema(
      { payment_id: { type: "string" }, amount: { type: "number" } },
      ["payment_id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { refundPaymentWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(refundPaymentWorkflow, {
        payment_id: stringArg(args, "payment_id"),
        ...(args.amount != null ? { amount: Number(args.amount) } : {}),
      })
    },
  })

  // --- Payment Collections ---

  registerTool({
    name: "list_payment_collections",
    toolset: "admin",
    description: "List payment collections.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "payment_collection", args),
  })

  registerTool({
    name: "get_payment_collection",
    toolset: "admin",
    description: "Get a payment collection by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "payment_collection", args.id),
  })

  registerTool({
    name: "create_payment_collection",
    toolset: "admin",
    description:
      "Create a payment collection for an order. Use khi đơn được tạo trực tiếp (không qua checkout) nên chưa có payment collection. " +
      "Input: { order_id, amount }. Sau khi tạo, dùng mark_payment_collection_paid để đánh dấu đã thanh toán.",
    risk: "mutating",
    schema: objectSchema(
      { order_id: { type: "string" }, amount: { type: "number" } },
      ["order_id", "amount"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { createOrderPaymentCollectionWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createOrderPaymentCollectionWorkflow, {
        order_id: stringArg(args, "order_id"),
        amount: Number(args.amount),
      })
    },
  })

  registerTool({
    name: "mark_payment_collection_paid",
    toolset: "admin",
    description: "Mark a payment collection as paid by ID.",
    risk: "mutating",
    schema: objectSchema(
      { payment_collection_id: { type: "string" }, order_id: { type: "string" } },
      ["payment_collection_id", "order_id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { markPaymentCollectionAsPaid } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(markPaymentCollectionAsPaid, {
        payment_collection_id: stringArg(args, "payment_collection_id"),
        order_id: stringArg(args, "order_id"),
      })
    },
  })
}
