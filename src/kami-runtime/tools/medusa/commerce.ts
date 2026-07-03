import type {
  CreateCustomerDTO,
  CreatePriceListWorkflowInputDTO,
  CreateProductWorkflowInputDTO,
  CreatePromotionDTO,
  CustomerUpdatableFields,
  UpdatePriceListDTO,
  UpdatePromotionDTO,
} from "@medusajs/framework/types"
import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, isValidEmail, enumValuesFor, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

// ── Layer-2 domain validators (nested DTO checks the loose schema can't express) ──

const validateCreateProduct = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const product = args.product
  if (!isObj(product)) {
    return missingField(
      "create_product",
      ["product"],
      "create_product requires a `product` object.",
      "Provide a product object with at least a title and a non-empty options array."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(product.title)) fields.push("product.title")
  const options = product.options
  if (!Array.isArray(options) || options.length === 0) {
    fields.push("product.options")
  } else {
    options.forEach((opt, i) => {
      if (!isObj(opt) || !isNonEmptyStr(opt.title))
        fields.push(`product.options[${i}].title`)
      if (!Array.isArray(opt?.values) || opt.values.length === 0)
        fields.push(`product.options[${i}].values`)
    })
  }
  const variants = product.variants
  if (variants !== undefined) {
    if (!Array.isArray(variants) || variants.length === 0) {
      fields.push("product.variants")
    } else {
      variants.forEach((v, i) => {
        if (!isObj(v) || !isNonEmptyStr(v.title))
          fields.push(`product.variants[${i}].title`)
      })
    }
  }
  const status = product.status
  if (status !== undefined) {
    const valid = enumValuesFor("product", "status")
    if (valid && !valid.includes(String(status))) fields.push("product.status")
  }
  if (!fields.length) return null
  return missingField(
    "create_product",
    fields,
    "create_product requires a non-empty title and a non-empty options array — Medusa rejects products without options.",
    "Add the missing fields. Each option needs a title and a non-empty values array; each variant needs a title."
  )
}

const requireUpdateObj = (
  tool: string,
  args: Record<string, unknown>,
  extraChecks?: (update: Record<string, unknown>, fields: string[]) => void
): ArgValidationResult | null => {
  const update = args.update
  if (!isObj(update) || Object.keys(update).length === 0) {
    return missingField(
      tool,
      ["update"],
      `${tool} received an empty or invalid update payload.`,
      "Provide a non-empty update object with the fields to change."
    )
  }
  const fields: string[] = []
  extraChecks?.(update, fields)
  if (!fields.length) return null
  return missingField(
    tool,
    fields,
    `${tool} received invalid fields in the update payload.`,
    "Correct the fields listed above."
  )
}

const validateUpdateProduct = (args: Record<string, unknown>) =>
  requireUpdateObj("update_product", args, (update, fields) => {
    const status = update.status
    if (status !== undefined) {
      const valid = enumValuesFor("product", "status")
      if (valid && !valid.includes(String(status))) fields.push("update.status")
    }
  })

const validateCreateOrder = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const order = args.order
  if (!isObj(order)) {
    return missingField(
      "create_order",
      ["order"],
      "create_order requires an `order` object.",
      "Provide an order object."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(order.email)) fields.push("order.email")
  if (!isNonEmptyStr(order.currency_code)) fields.push("order.currency_code")
  const items = order.items
  if (!Array.isArray(items) || items.length === 0) {
    fields.push("order.items")
  } else {
    items.forEach((item, i) => {
      if (!isObj(item) || !isNonEmptyStr(item.variant_id))
        fields.push(`order.items[${i}].variant_id`)
      if (!isObj(item) || typeof item.quantity !== "number" || item.quantity <= 0)
        fields.push(`order.items[${i}].quantity`)
    })
  }
  if (!isObj(order.shipping_address)) fields.push("order.shipping_address")
  if (!isObj(order.billing_address)) fields.push("order.billing_address")
  if (!fields.length) return null
  return missingField(
    "create_order",
    fields,
    "create_order requires email, currency_code, items[] (each with variant_id + quantity>0), shipping_address, and billing_address.",
    "Add the missing fields. Each item needs a variant_id and a positive quantity."
  )
}

const validateCreateCustomer = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const customer = args.customer
  if (!isObj(customer)) {
    return missingField(
      "create_customer",
      ["customer"],
      "create_customer requires a `customer` object.",
      "Provide a customer object."
    )
  }
  const fields: string[] = []
  if (customer.email !== undefined && !isValidEmail(customer.email))
    fields.push("customer.email")
  const hasIdentity =
    isNonEmptyStr(customer.email) ||
    isNonEmptyStr(customer.phone) ||
    isNonEmptyStr(customer.first_name) ||
    isNonEmptyStr(customer.last_name)
  if (!hasIdentity) fields.push("customer")
  if (!fields.length) return null
  return missingField(
    "create_customer",
    fields,
    "create_customer needs a valid email (if provided) and at least one identifying field (email, phone, or a name).",
    "Provide a valid email and/or phone and/or first_name/last_name."
  )
}

const validateUpdateCustomer = (args: Record<string, unknown>) =>
  requireUpdateObj("update_customer", args, (update, fields) => {
    if (update.email !== undefined && !isValidEmail(update.email))
      fields.push("update.email")
  })

const validateCreatePromotion = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const promotion = args.promotion
  if (!isObj(promotion)) {
    return missingField(
      "create_promotion",
      ["promotion"],
      "create_promotion requires a `promotion` object.",
      "Provide a promotion object."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(promotion.code)) fields.push("promotion.code")
  if (!isNonEmptyStr(promotion.type)) fields.push("promotion.type")
  if (!fields.length) return null
  return missingField(
    "create_promotion",
    fields,
    "create_promotion requires at least a code and a type.",
    "Add the missing fields (code, type)."
  )
}

const validateCreatePriceList = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const priceList = args.price_list
  if (!isObj(priceList) || !isNonEmptyStr(priceList.title)) {
    return missingField(
      "create_price_list",
      ["price_list.title"],
      "create_price_list requires a price_list object with a non-empty title.",
      "Provide price_list.title (e.g. 'Black Friday')."
    )
  }
  return null
}

const validateCreateCampaign = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const campaign = args.campaign
  if (!isObj(campaign)) {
    return missingField(
      "create_campaign",
      ["campaign"],
      "create_campaign requires a `campaign` object.",
      "Provide a campaign object with name and campaign_identifier."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(campaign.name)) fields.push("campaign.name")
  if (!isNonEmptyStr(campaign.campaign_identifier)) fields.push("campaign.campaign_identifier")
  if (!fields.length) return null
  return missingField(
    "create_campaign",
    fields,
    "create_campaign requires a name and a campaign_identifier.",
    "Set campaign.name and campaign.campaign_identifier (a unique code)."
  )
}

export const registerCommerceTools = () => {
  // ======================== Products ========================

  registerTool({
    name: "list_products",
    toolset: "admin",
    description: "List products.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "product", args),
  })

  registerTool({
    name: "get_product",
    toolset: "admin",
    description: "Get a product by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "product", args.id),
  })

  registerTool({
    name: "create_product",
    toolset: "admin",
    description:
      "Create a product. The `product` object MUST include a non-empty `options` array — the system rejects products without options. Minimal valid example: { title, status: \"draft\", options: [{ title: \"Default\", values: [{ name: \"Default\" }] }], variants: [{ title: \"Default\", options: { Default: \"Default\" }, prices: [{ amount: 1000, currency_code: \"usd\" }] }] }.",
    risk: "mutating",
    schema: objectSchema(
      {
        product: {
          type: "object",
          description:
            "CreateProductWorkflowInputDTO. REQUIRED: title and a non-empty `options` array.",
        },
      },
      ["product"]
    ),
    validate: validateCreateProduct,
    handler: async (args, ctx: KamiCtx) => {
      const { createProductsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createProductsWorkflow, {
        products: [typedPayload<CreateProductWorkflowInputDTO>(args, "product")],
      })
    },
  })

  registerTool({
    name: "update_product",
    toolset: "admin",
    description: "Update a product by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    validate: validateUpdateProduct,
    handler: async (args, ctx: KamiCtx) => {
      const { updateProductsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateProductsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload<any>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_product",
    toolset: "admin",
    description: "Delete a product by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const id = stringArg(args, "id")
      const { deleteProductsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteProductsWorkflow, { ids: [id] })
      return { id, object: "product", deleted: true }
    },
  })

  // ======================== Orders ========================

  registerTool({
    name: "list_orders",
    toolset: "admin",
    description: "List orders.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "order", args),
  })

  registerTool({
    name: "get_order",
    toolset: "admin",
    description: "Get an order by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "order", args.id),
  })

  registerTool({
    name: "create_order",
    toolset: "admin",
    description: "Create an order. Requires at minimum: email, currency_code, items (with variant_id, quantity), shipping_address, and billing_address.",
    risk: "mutating",
    schema: objectSchema(
      { order: { type: "object" } },
      ["order"]
    ),
    validate: validateCreateOrder,
    handler: async (args, ctx: KamiCtx) => {
      const { createOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createOrderWorkflow, typedPayload<any>(args, "order"))
    },
  })

  registerTool({
    name: "update_order",
    toolset: "admin",
    description: "Update an order by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateOrderWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateOrderWorkflow, {
        id: stringArg(args, "id"),
        ...typedPayload<any>(args, "update"),
      })
    },
  })

  registerTool({
    name: "cancel_order",
    toolset: "admin",
    description: "Cancel an order. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema(
      { id: { type: "string" }, canceled_by: { type: "string" } },
      ["id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { cancelOrderWorkflow } = await import("@medusajs/core-flows")
      const id = stringArg(args, "id")
      const canceledBy = typeof args.canceled_by === "string" ? args.canceled_by : ctx.userId ?? "kami"
      await ctx.executor.runWorkflow(cancelOrderWorkflow, { order_id: id, canceled_by: canceledBy })
      return await graphById(ctx, "order", id)
    },
  })

  registerTool({
    name: "archive_order",
    toolset: "admin",
    description: "Archive an order by ID.",
    risk: "mutating",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { archiveOrderWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(archiveOrderWorkflow, { order_ids: [stringArg(args, "id")] })
      return await graphById(ctx, "order", args.id)
    },
  })

  registerTool({
    name: "complete_order",
    toolset: "admin",
    description: "Complete (mark as fulfilled/archived) an order by ID.",
    risk: "mutating",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { completeOrderWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(completeOrderWorkflow, { orderIds: [stringArg(args, "id")] })
      return await graphById(ctx, "order", args.id)
    },
  })

  // ======================== Customers ========================

  registerTool({
    name: "list_customers",
    toolset: "admin",
    description: "List customers.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "customer", args),
  })

  registerTool({
    name: "get_customer",
    toolset: "admin",
    description: "Get a customer by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "customer", args.id),
  })

  registerTool({
    name: "create_customer",
    toolset: "admin",
    description: "Create a customer.",
    risk: "mutating",
    schema: objectSchema(
      { customer: { type: "object" } },
      ["customer"]
    ),
    validate: validateCreateCustomer,
    handler: async (args, ctx: KamiCtx) => {
      const { createCustomersWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createCustomersWorkflow, {
        customersData: [typedPayload<CreateCustomerDTO>(args, "customer")],
      })
    },
  })

  registerTool({
    name: "update_customer",
    toolset: "admin",
    description: "Update a customer by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    validate: validateUpdateCustomer,
    handler: async (args, ctx: KamiCtx) => {
      const { updateCustomersWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateCustomersWorkflow, {
        selector: { id: [stringArg(args, "id")] },
        update: typedPayload<CustomerUpdatableFields>(args, "update"),
      })
    },
  })

  // ======================== Price Lists ========================

  registerTool({
    name: "list_price_lists",
    toolset: "admin",
    description: "List price lists.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "price_list", args),
  })

  registerTool({
    name: "get_price_list",
    toolset: "admin",
    description: "Get a price list by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "price_list", args.id),
  })

  registerTool({
    name: "create_price_list",
    toolset: "admin",
    description: "Create a price list.",
    risk: "mutating",
    schema: objectSchema(
      { price_list: { type: "object" } },
      ["price_list"]
    ),
    validate: validateCreatePriceList,
    handler: async (args, ctx: KamiCtx) => {
      const { createPriceListsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createPriceListsWorkflow, {
        price_lists_data: [typedPayload<CreatePriceListWorkflowInputDTO>(args, "price_list")],
      })
    },
  })

  registerTool({
    name: "update_price_list",
    toolset: "admin",
    description: "Update a price list by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updatePriceListsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updatePriceListsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload<UpdatePriceListDTO>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_price_list",
    toolset: "admin",
    description: "Delete a price list by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deletePriceListsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deletePriceListsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "price_list", deleted: true }
    },
  })

  // ======================== Promotions ========================

  registerTool({
    name: "list_promotions",
    toolset: "admin",
    description: "List promotions.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "promotion", args),
  })

  registerTool({
    name: "get_promotion",
    toolset: "admin",
    description: "Get a promotion by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "promotion", args.id),
  })

  registerTool({
    name: "create_promotion",
    toolset: "admin",
    description: "Create a promotion.",
    risk: "mutating",
    schema: objectSchema(
      { promotion: { type: "object" } },
      ["promotion"]
    ),
    validate: validateCreatePromotion,
    handler: async (args, ctx: KamiCtx) => {
      const { createPromotionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createPromotionsWorkflow, {
        promotionsData: [typedPayload<CreatePromotionDTO>(args, "promotion")],
      })
    },
  })

  registerTool({
    name: "update_promotion",
    toolset: "admin",
    description: "Update a promotion by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updatePromotionsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updatePromotionsWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload<UpdatePromotionDTO>(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_promotion",
    toolset: "admin",
    description: "Delete a promotion by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deletePromotionsWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deletePromotionsWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "promotion", deleted: true }
    },
  })

  registerTool({
    name: "list_campaigns",
    toolset: "admin",
    description: "List promotion campaigns.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "campaign", args),
  })

  registerTool({
    name: "create_campaign",
    toolset: "admin",
    description: "Create a promotion campaign.",
    risk: "mutating",
    schema: objectSchema(
      { campaign: { type: "object" } },
      ["campaign"]
    ),
    validate: validateCreateCampaign,
    handler: async (args, ctx: KamiCtx) => {
      const { createCampaignsWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createCampaignsWorkflow, {
        campaignsData: [typedPayload<any>(args, "campaign")],
      })
    },
  })

  // ======================== Sales Summary ========================

  registerTool({
    name: "sales_summary",
    toolset: "admin",
    description: "Return a lightweight commerce summary.",
    risk: "read",
    schema: objectSchema({}),
    handler: async (_args, ctx: KamiCtx) => {
      const [products, orders, customers] = await Promise.all([
        graph(ctx, "product", { limit: 1 }),
        graph(ctx, "order", { limit: 1 }),
        graph(ctx, "customer", { limit: 1 }),
      ])
      return {
        products: products.metadata ?? { sample_count: products.data?.length },
        orders: orders.metadata ?? { sample_count: orders.data?.length },
        customers: customers.metadata ?? { sample_count: customers.data?.length },
      }
    },
  })
}
