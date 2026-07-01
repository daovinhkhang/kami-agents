import { objectSchema, graph } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

type Row = Record<string, any>

const rows = (result: any): Row[] => Array.isArray(result?.data) ? result.data as Row[] : []

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

const localDateKey = (value: unknown, timeZone = "Asia/Ho_Chi_Minh") => {
  const date = value ? new Date(String(value)) : new Date()

  if (Number.isNaN(date.getTime())) {
    return "unknown"
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

const fullName = (row: Row) =>
  `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || null

const orderCustomerKey = (order: Row) =>
  String(order.customer_id ?? order.email ?? "guest")

const withinDays = (row: Row, since: Date) => {
  const createdAt = row.created_at ? new Date(String(row.created_at)) : null

  return createdAt ? createdAt >= since : false
}

const asList = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []

const buildOperationalIssues = (input: {
  products: Row[]
  orders: Row[]
  levels: Row[]
  stockLocations: Row[]
  shippingOptions: Row[]
  threshold: number
}) => {
  const productVariantCounts = input.products.map((product) => ({
    product_id: String(product.id),
    title: String(product.title ?? "untitled"),
    variant_count: asList(product.variants).length,
    status: String(product.status ?? "unknown"),
  }))
  const lowStockItems = input.levels
    .map((level) => ({
      inventory_item_id: level.inventory_item_id,
      location_id: level.location_id,
      stocked_quantity: num(level.stocked_quantity),
      reserved_quantity: num(level.reserved_quantity),
      available: num(level.stocked_quantity) - num(level.reserved_quantity),
      incoming_quantity: num(level.incoming_quantity),
    }))
    .filter((level) => level.available <= input.threshold)
    .sort((a, b) => a.available - b.available)
  const ordersNeedFulfillment = input.orders.filter((order) => {
    const status = String(order.status ?? "").toLowerCase()
    const fulfillment = String(order.fulfillment_status ?? "").toLowerCase()

    return !["canceled", "cancelled", "completed"].includes(status) &&
      !["fulfilled", "shipped", "delivered"].includes(fulfillment)
  })
  const unpaidOrders = input.orders.filter((order) => {
    const payment = String(order.payment_status ?? "").toLowerCase()

    return payment && !["paid", "captured", "partially_refunded", "refunded"].includes(payment)
  })
  const locationsWithoutFulfillmentSet = input.stockLocations.filter((location) =>
    asList(location.fulfillment_sets).length === 0
  )
  const issues: Row[] = []

  if (input.products.length === 0) {
    issues.push({
      severity: "critical",
      category: "catalog",
      title: "No products in catalog",
      count: 0,
      recommended_tool: "create_commerce_draft",
      recommended_args: {
        draft_type: "product",
        title: "Create first product",
        target_tool: "create_product",
        args: {},
        risk: "mutating",
        confirm_required: true,
      },
    })
  }

  const noVariantCount = productVariantCounts.filter((product) => product.variant_count === 0).length
  if (noVariantCount > 0) {
    issues.push({
      severity: "warning",
      category: "catalog",
      title: "Products without variants",
      count: noVariantCount,
      recommended_tool: "product_opportunity_report",
      recommended_args: {},
    })
  }

  if (lowStockItems.length > 0) {
    issues.push({
      severity: "warning",
      category: "inventory",
      title: "Low-stock inventory items",
      count: lowStockItems.length,
      recommended_tool: "inventory_report",
      recommended_args: { low_stock_threshold: input.threshold },
    })
  }

  if (ordersNeedFulfillment.length > 0) {
    issues.push({
      severity: "warning",
      category: "orders",
      title: "Orders may need fulfillment",
      count: ordersNeedFulfillment.length,
      recommended_tool: "list_orders",
      recommended_args: { limit: 20 },
    })
  }

  if (unpaidOrders.length > 0) {
    issues.push({
      severity: "warning",
      category: "payments",
      title: "Orders may need payment review",
      count: unpaidOrders.length,
      recommended_tool: "list_orders",
      recommended_args: { limit: 20 },
    })
  }

  if (input.shippingOptions.length === 0 || locationsWithoutFulfillmentSet.length > 0) {
    issues.push({
      severity: "critical",
      category: "fulfillment",
      title: "Shipping or fulfillment setup is incomplete",
      count: input.shippingOptions.length === 0
        ? locationsWithoutFulfillmentSet.length + 1
        : locationsWithoutFulfillmentSet.length,
      recommended_tool: "operations_risk_report",
      recommended_args: {},
    })
  }

  const riskScore = Math.min(
    100,
    issues.reduce((total, issue) => total + (issue.severity === "critical" ? 30 : 15), 0)
  )

  return {
    risk_score: riskScore,
    issues,
    low_stock_items: lowStockItems,
    orders_need_fulfillment: ordersNeedFulfillment.slice(0, 25),
    unpaid_orders: unpaidOrders.slice(0, 25),
    products_without_variants: productVariantCounts
      .filter((product) => product.variant_count === 0)
      .slice(0, 25),
    shipping_setup: {
      stock_locations: input.stockLocations.length,
      shipping_options: input.shippingOptions.length,
      locations_without_fulfillment_set: locationsWithoutFulfillmentSet.map((location) => ({
        id: location.id,
        name: location.name,
      })),
    },
  }
}

export const registerReportTools = () => {
  registerTool({
    name: "order_analytics",
    toolset: "admin",
    description:
      "Aggregated order analytics: breakdown by status, date range, and total revenue. Useful for dashboards and period-over-period comparisons.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Number of days back to analyze (default 30).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Number(args.days ?? 30)
      const since = new Date()
      since.setDate(since.getDate() - days)

      const orders = await graph(ctx, "order", {
        fields: [
          "id", "display_id", "status", "email", "currency_code",
          "total", "item_total", "shipping_total", "tax_total",
          "created_at", "updated_at",
        ],
        limit: 500,
      })
      const rawData = (orders.data ?? []) as Record<string, unknown>[]

      // Filter in-memory: graph() does not support $gte/$lt operators
      const data = rawData.filter((o) => {
        const ts = o.created_at as string | undefined
        return ts ? new Date(ts) >= since : false
      })

      const byStatus: Record<string, { count: number; total: number }> = {}
      let totalRevenue = 0
      let totalOrders = data.length

      for (const o of data) {
        const status = String(o.status ?? "unknown")
        const total = Number(o.total ?? 0)
        if (!byStatus[status]) {
          byStatus[status] = { count: 0, total: 0 }
        }
        byStatus[status].count++
        byStatus[status].total += total
        totalRevenue += total
      }

      return {
        period_days: days,
        since: since.toISOString(),
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        avg_order_value: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        by_status: byStatus,
        currency: data[0]?.currency_code ?? "unknown",
      }
    },
  })

  registerTool({
    name: "inventory_report",
    toolset: "admin",
    description:
      "Inventory health report: low-stock items, stock by location, and items with no reservations. Helps avoid stockouts.",
    risk: "read",
    schema: objectSchema({
      low_stock_threshold: {
        type: "number",
        description: "Stocked quantity below which an item is flagged as low (default 5).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const threshold = Number(args.low_stock_threshold ?? 5)

      const [levels, items] = await Promise.all([
        graph(ctx, "inventory_level", {
          fields: [
            "id", "inventory_item_id", "location_id",
            "stocked_quantity", "reserved_quantity", "incoming_quantity",
          ],
          limit: 500,
        }),
        graph(ctx, "inventory_item", {
          fields: ["id", "sku", "title"],
          limit: 500,
        }),
      ])

      const levelData = (levels.data ?? []) as Record<string, unknown>[]
      const itemData = (items.data ?? []) as Record<string, unknown>[]

      const itemMap = new Map<string, Record<string, unknown>>()
      for (const it of itemData) {
        itemMap.set(String(it.id), it)
      }

      const lowStock: Record<string, unknown>[] = []
      const byLocation: Record<string, { total_sku: number; total_qty: number; total_reserved: number }> = {}
      let totalQty = 0
      let totalReserved = 0

      for (const lv of levelData) {
        const loc = String(lv.location_id ?? "unknown")
        const qty = Number(lv.stocked_quantity ?? 0)
        const reserved = Number(lv.reserved_quantity ?? 0)
        const incoming = Number(lv.incoming_quantity ?? 0)

        if (!byLocation[loc]) {
          byLocation[loc] = { total_sku: 0, total_qty: 0, total_reserved: 0 }
        }
        byLocation[loc].total_sku++
        byLocation[loc].total_qty += qty
        byLocation[loc].total_reserved += reserved
        totalQty += qty
        totalReserved += reserved

        if (qty < threshold) {
          const sku = itemMap.get(String(lv.inventory_item_id))?.sku ?? "?"
          lowStock.push({
            inventory_item_id: lv.inventory_item_id,
            sku,
            location_id: lv.location_id,
            stocked_quantity: qty,
            reserved_quantity: reserved,
            incoming_quantity: incoming,
            available: qty - reserved,
          })
        }
      }

      return {
        low_stock_threshold: threshold,
        low_stock_items: lowStock,
        total_items_tracked: itemData.length,
        total_levels: levelData.length,
        total_stocked: totalQty,
        total_reserved: totalReserved,
        by_location: byLocation,
      }
    },
  })

  registerTool({
    name: "customer_insights",
    toolset: "admin",
    description:
      "Customer insights: top customers by order count, new vs returning breakdown, and acquisition trends.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Window in days for recent customer activity (default 90).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Number(args.days ?? 90)
      const since = new Date()
      since.setDate(since.getDate() - days)

      const [customers, orders] = await Promise.all([
        graph(ctx, "customer", {
          fields: ["id", "email", "first_name", "last_name", "created_at", "updated_at"],
          limit: 500,
        }),
        graph(ctx, "order", {
          fields: ["id", "customer_id", "total", "status", "created_at"],
          limit: 500,
        }),
      ])

      const custData = (customers.data ?? []) as Record<string, unknown>[]
      const orderData = (orders.data ?? []) as Record<string, unknown>[]

      // Filter in-memory: graph() does not support $gte/$lt operators
      const recentOrders = orderData.filter((o) => {
        const ts = o.created_at as string | undefined
        return ts ? new Date(ts) >= since : false
      })

      const customerOrders = new Map<string, { count: number; total_spent: number; statuses: string[] }>()
      const recentCustomerIds = new Set<string>()

      for (const o of recentOrders) {
        const cid = String(o.customer_id ?? "guest")
        recentCustomerIds.add(cid)
        if (!customerOrders.has(cid)) {
          customerOrders.set(cid, { count: 0, total_spent: 0, statuses: [] })
        }
        const entry = customerOrders.get(cid)!
        entry.count++
        entry.total_spent += Number(o.total ?? 0)
        entry.statuses.push(String(o.status ?? "unknown"))
      }

      // Top customers by order count
      const top = [...customerOrders.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([cid, stats]) => {
          const cust = custData.find(c => String(c.id) === cid)
          return {
            customer_id: cid,
            email: cust?.email ?? null,
            name: cust ? `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim() : null,
            order_count: stats.count,
            total_spent: stats.total_spent,
          }
        })

      return {
        period_days: days,
        since: since.toISOString(),
        total_customers: custData.length,
        active_customers_in_period: recentCustomerIds.size,
        top_customers: top,
      }
    },
  })

  registerTool({
    name: "product_performance",
    toolset: "admin",
    description:
      "Product performance: best and worst selling products, variant counts, and status breakdown.",
    risk: "read",
    schema: objectSchema({}),
    handler: async (args, ctx: KamiCtx) => {
      const products = await graph(ctx, "product", {
        fields: [
          "id", "title", "handle", "status", "thumbnail",
          "created_at", "updated_at",
          "variants.id", "variants.title", "variants.sku",
        ],
        limit: 200,
      })

      const data = (products.data ?? []) as Record<string, unknown>[] & {
        variants?: unknown[]
      }

      const byStatus: Record<string, number> = {}
      const variantCounts: { product_id: string; title: string; variant_count: number }[] = []

      for (const p of data) {
        const status = String(p.status ?? "draft")
        byStatus[status] = (byStatus[status] ?? 0) + 1
        const vc = Array.isArray(p.variants) ? p.variants.length : 0
        variantCounts.push({
          product_id: String(p.id),
          title: String(p.title ?? "untitled"),
          variant_count: vc,
        })
      }

      variantCounts.sort((a, b) => b.variant_count - a.variant_count)

      return {
        total_products: data.length,
        by_status: byStatus,
        products_most_variants: variantCounts.slice(0, 10),
        products_no_variants: variantCounts.filter(v => v.variant_count === 0).length,
      }
    },
  })

  registerTool({
    name: "commerce_dashboard",
    toolset: "admin",
    description:
      "Commerce intelligence dashboard combining sales, catalog, customers, inventory, fulfillment risks, and next-best actions.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Number of days back for revenue and activity metrics (default 30).",
      },
      low_stock_threshold: {
        type: "number",
        description: "Available stock at or below this value is flagged (default 5).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Math.max(1, num(args.days, 30))
      const threshold = num(args.low_stock_threshold, 5)
      const since = new Date()
      since.setDate(since.getDate() - days)

      const [productsResult, ordersResult, customersResult, levelsResult, locationsResult, shippingResult] =
        await Promise.all([
          graph(ctx, "product", {
            fields: [
              "id", "title", "status", "created_at", "updated_at",
              "variants.id", "variants.title", "variants.sku",
            ],
            limit: 200,
          }),
          graph(ctx, "order", {
            fields: [
              "id", "display_id", "status", "email", "customer_id",
              "currency_code", "total", "item_total", "shipping_total", "tax_total",
              "payment_status", "fulfillment_status", "created_at", "updated_at",
            ],
            limit: 500,
          }),
          graph(ctx, "customer", {
            fields: ["id", "email", "first_name", "last_name", "created_at", "updated_at"],
            limit: 500,
          }),
          graph(ctx, "inventory_level", { limit: 500 }),
          graph(ctx, "stock_location", { limit: 100 }),
          graph(ctx, "shipping_option", { limit: 100 }),
        ])

      const products = rows(productsResult)
      const orders = rows(ordersResult)
      const customers = rows(customersResult)
      const levels = rows(levelsResult)
      const recentOrders = orders.filter((order) => withinDays(order, since))
      const currency = String(recentOrders[0]?.currency_code ?? orders[0]?.currency_code ?? "unknown")
      const daily = new Map<string, { date: string; orders: number; revenue: number }>()
      let revenue = 0

      for (const order of recentOrders) {
        const date = localDateKey(order.created_at, ctx.config.timezone)
        const total = num(order.total)
        const bucket = daily.get(date) ?? { date, orders: 0, revenue: 0 }
        bucket.orders += 1
        bucket.revenue += total
        daily.set(date, bucket)
        revenue += total
      }

      const operations = buildOperationalIssues({
        products,
        orders,
        levels,
        stockLocations: rows(locationsResult),
        shippingOptions: rows(shippingResult),
        threshold,
      })

      const nextBestActions = [
        operations.issues[0]
          ? {
              label: `Fix ${operations.issues[0].category} risk`,
              kind: "fix",
              tool: operations.issues[0].recommended_tool,
              args: operations.issues[0].recommended_args ?? {},
              risk: operations.issues[0].recommended_tool === "create_commerce_draft" ? "safe" : "read",
              confirm_required: false,
            }
          : null,
        {
          label: "Open operations risk report",
          kind: "report",
          tool: "operations_risk_report",
          args: { low_stock_threshold: threshold },
          risk: "read",
          confirm_required: false,
        },
        {
          label: "Review customer retention",
          kind: "report",
          tool: "customer_retention_report",
          args: { days },
          risk: "read",
          confirm_required: false,
        },
        {
          label: "Create profit and loss estimate",
          kind: "report",
          tool: "profit_loss_report",
          args: { days },
          risk: "read",
          confirm_required: false,
        },
      ].filter(Boolean)

      return {
        period_days: days,
        since: since.toISOString(),
        generated_at: new Date().toISOString(),
        timezone: ctx.config.timezone,
        currency,
        kpis: {
          products: products.length,
          customers: customers.length,
          orders_in_period: recentOrders.length,
          revenue_in_period: revenue,
          average_order_value: recentOrders.length ? revenue / recentOrders.length : 0,
          low_stock_items: operations.low_stock_items.length,
          operational_risk_score: operations.risk_score,
        },
        daily_revenue: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
        operational_issues: operations.issues,
        next_best_actions: nextBestActions,
        data_quality: {
          orders_sampled: orders.length,
          products_sampled: products.length,
          customers_sampled: customers.length,
          note: "Metrics are computed from graph query samples and the configured local business timezone.",
        },
      }
    },
  })

  registerTool({
    name: "profit_loss_report",
    toolset: "admin",
    description:
      "Profit and loss intelligence for a period. Uses real order totals and explicitly marks COGS/profit estimates when cost data is missing.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Number of days back to analyze (default 30).",
      },
      estimated_cogs_rate: {
        type: "number",
        description: "Optional estimated cost-of-goods rate from 0 to 1. If omitted, profit is not invented.",
      },
      include_unpaid: {
        type: "boolean",
        description: "Include unpaid orders in revenue totals (default false).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Math.max(1, num(args.days, 30))
      const includeUnpaid = args.include_unpaid === true
      const rawCogsRate = args.estimated_cogs_rate === undefined
        ? null
        : Math.min(Math.max(num(args.estimated_cogs_rate), 0), 1)
      const since = new Date()
      since.setDate(since.getDate() - days)

      const ordersResult = await graph(ctx, "order", {
        fields: [
          "id", "display_id", "status", "payment_status", "currency_code",
          "total", "item_total", "shipping_total", "tax_total", "discount_total",
          "created_at", "updated_at",
        ],
        limit: 500,
      })
      const orders = rows(ordersResult).filter((order) => withinDays(order, since))
      const paidStatuses = new Set(["paid", "captured", "partially_refunded", "refunded"])
      const includedOrders = includeUnpaid
        ? orders
        : orders.filter((order) => {
            const payment = String(order.payment_status ?? "").toLowerCase()
            return !payment || paidStatuses.has(payment)
          })
      const daily = new Map<string, { date: string; orders: number; revenue: number }>()
      let grossRevenue = 0
      let itemTotal = 0
      let shippingTotal = 0
      let taxTotal = 0
      let discountTotal = 0

      for (const order of includedOrders) {
        const date = localDateKey(order.created_at, ctx.config.timezone)
        const total = num(order.total)
        const bucket = daily.get(date) ?? { date, orders: 0, revenue: 0 }
        bucket.orders += 1
        bucket.revenue += total
        daily.set(date, bucket)
        grossRevenue += total
        itemTotal += num(order.item_total)
        shippingTotal += num(order.shipping_total)
        taxTotal += num(order.tax_total)
        discountTotal += num(order.discount_total)
      }

      const estimatedCogs = rawCogsRate === null ? null : itemTotal * rawCogsRate
      const grossProfit = estimatedCogs === null ? null : grossRevenue - estimatedCogs
      const margin = grossProfit === null || grossRevenue === 0 ? null : grossProfit / grossRevenue

      return {
        period_days: days,
        since: since.toISOString(),
        include_unpaid: includeUnpaid,
        currency: String(includedOrders[0]?.currency_code ?? orders[0]?.currency_code ?? "unknown"),
        order_count: includedOrders.length,
        excluded_unpaid_orders: orders.length - includedOrders.length,
        revenue: {
          gross_revenue: grossRevenue,
          item_total: itemTotal,
          shipping_total: shippingTotal,
          tax_total: taxTotal,
          discount_total: discountTotal,
        },
        costs: {
          estimated_cogs_rate: rawCogsRate,
          estimated_cogs: estimatedCogs,
          cost_source: rawCogsRate === null
            ? "missing_cost_data"
            : "user_supplied_estimated_cogs_rate",
        },
        profit: {
          gross_profit_estimate: grossProfit,
          gross_margin_estimate: margin,
          confidence: rawCogsRate === null ? "low" : "medium",
        },
        daily_revenue: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
        top_orders: includedOrders
          .slice()
          .sort((a, b) => num(b.total) - num(a.total))
          .slice(0, 20)
          .map((order) => ({
            id: order.id,
            display_id: order.display_id,
            status: order.status,
            payment_status: order.payment_status,
            total: num(order.total),
            created_at: order.created_at,
          })),
        caveats: [
          "Refunds, payment fees, tax remittance, shipping carrier costs, and product costs may be incomplete unless present in store data.",
          rawCogsRate === null
            ? "No COGS rate was supplied, so KAMI reports revenue but does not invent profit."
            : "COGS is an estimate based on the supplied rate, not a verified accounting ledger.",
        ],
      }
    },
  })

  registerTool({
    name: "operations_risk_report",
    toolset: "admin",
    description:
      "Operational risk report covering fulfillment setup, unpaid/unfulfilled orders, low stock, and catalog blockers.",
    risk: "read",
    schema: objectSchema({
      low_stock_threshold: {
        type: "number",
        description: "Available stock at or below this value is flagged (default 5).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const threshold = num(args.low_stock_threshold, 5)
      const [productsResult, ordersResult, levelsResult, locationsResult, shippingResult] =
        await Promise.all([
          graph(ctx, "product", {
            fields: ["id", "title", "status", "variants.id", "variants.title", "variants.sku"],
            limit: 200,
          }),
          graph(ctx, "order", {
            fields: [
              "id", "display_id", "status", "payment_status", "fulfillment_status",
              "email", "total", "currency_code", "created_at",
            ],
            limit: 500,
          }),
          graph(ctx, "inventory_level", { limit: 500 }),
          graph(ctx, "stock_location", { limit: 100 }),
          graph(ctx, "shipping_option", { limit: 100 }),
        ])
      const operations = buildOperationalIssues({
        products: rows(productsResult),
        orders: rows(ordersResult),
        levels: rows(levelsResult),
        stockLocations: rows(locationsResult),
        shippingOptions: rows(shippingResult),
        threshold,
      })

      return {
        generated_at: new Date().toISOString(),
        low_stock_threshold: threshold,
        risk_score: operations.risk_score,
        issues: operations.issues,
        low_stock_items: operations.low_stock_items.slice(0, 50),
        orders_need_fulfillment: operations.orders_need_fulfillment,
        unpaid_orders: operations.unpaid_orders,
        products_without_variants: operations.products_without_variants,
        shipping_setup: operations.shipping_setup,
        recommended_actions: operations.issues.map((issue) => ({
          label: issue.title,
          tool: issue.recommended_tool,
          args: issue.recommended_args ?? {},
          risk: issue.recommended_tool === "create_commerce_draft" ? "safe" : "read",
          confirm_required: false,
        })),
      }
    },
  })

  registerTool({
    name: "customer_retention_report",
    toolset: "admin",
    description:
      "Customer retention intelligence: customers without orders, repeat buyers, top customers, and recent acquisition quality.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Recent activity window in days (default 90).",
      },
      stale_after_days: {
        type: "number",
        description: "Customers with no order after this many days are stale (default 60).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Math.max(1, num(args.days, 90))
      const staleAfterDays = Math.max(1, num(args.stale_after_days, 60))
      const since = new Date()
      since.setDate(since.getDate() - days)
      const staleSince = new Date()
      staleSince.setDate(staleSince.getDate() - staleAfterDays)

      const [customersResult, ordersResult] = await Promise.all([
        graph(ctx, "customer", {
          fields: ["id", "email", "first_name", "last_name", "phone", "created_at", "updated_at"],
          limit: 500,
        }),
        graph(ctx, "order", {
          fields: ["id", "customer_id", "email", "total", "status", "currency_code", "created_at"],
          limit: 500,
        }),
      ])
      const customers = rows(customersResult)
      const orders = rows(ordersResult)
      const orderStats = new Map<string, {
        order_count: number
        total_spent: number
        last_order_at: string | null
        recent_order_count: number
      }>()

      for (const order of orders) {
        const key = orderCustomerKey(order)
        const stats = orderStats.get(key) ?? {
          order_count: 0,
          total_spent: 0,
          last_order_at: null,
          recent_order_count: 0,
        }
        stats.order_count += 1
        stats.total_spent += num(order.total)
        if (!stats.last_order_at || new Date(order.created_at) > new Date(stats.last_order_at)) {
          stats.last_order_at = order.created_at
        }
        if (withinDays(order, since)) {
          stats.recent_order_count += 1
        }
        orderStats.set(key, stats)
      }

      const customerRows = customers.map((customer) => {
        const stats = orderStats.get(String(customer.id)) ??
          orderStats.get(String(customer.email)) ??
          { order_count: 0, total_spent: 0, last_order_at: null, recent_order_count: 0 }
        const segment = stats.order_count === 0
          ? "no_orders"
          : stats.order_count > 1
            ? "repeat"
            : "one_time"

        return {
          customer_id: customer.id,
          email: customer.email,
          name: fullName(customer),
          phone: customer.phone,
          created_at: customer.created_at,
          order_count: stats.order_count,
          recent_order_count: stats.recent_order_count,
          total_spent: stats.total_spent,
          last_order_at: stats.last_order_at,
          segment,
        }
      })
      const noOrders = customerRows.filter((customer) => customer.order_count === 0)
      const repeat = customerRows.filter((customer) => customer.order_count > 1)
      const stale = customerRows.filter((customer) =>
        customer.order_count > 0 &&
        customer.last_order_at &&
        new Date(customer.last_order_at) < staleSince
      )

      return {
        period_days: days,
        stale_after_days: staleAfterDays,
        total_customers: customers.length,
        segments: {
          no_orders: noOrders.length,
          one_time: customerRows.filter((customer) => customer.order_count === 1).length,
          repeat: repeat.length,
          stale: stale.length,
        },
        top_customers: customerRows
          .slice()
          .sort((a, b) => b.total_spent - a.total_spent)
          .slice(0, 20),
        customers_without_orders: noOrders.slice(0, 50),
        stale_customers: stale.slice(0, 50),
        recommended_actions: [
          noOrders.length > 0
            ? {
                label: "Draft win-back campaign",
                tool: "create_commerce_draft",
                args: {
                  draft_type: "campaign",
                  title: "Customers without orders campaign",
                  target_tool: "create_campaign",
                  args: {},
                  risk: "mutating",
                  confirm_required: true,
                  metadata: { audience: "customers_without_orders", count: noOrders.length },
                },
                risk: "safe",
                confirm_required: false,
              }
            : null,
          {
            label: "Schedule retention report",
            tool: "create_commerce_draft",
            args: {
              draft_type: "schedule",
              title: "Weekly Retention Report Schedule",
              target_tool: "schedule_task",
              args: {
                name: "Weekly Retention Report",
                prompt: "Create a customer retention report and highlight customers without orders, stale customers, and top customers.",
                schedule_description: "every monday at 8am",
                deliver: "session",
              },
              risk: "mutating",
              confirm_required: true,
            },
            risk: "safe",
            confirm_required: false,
          },
        ].filter(Boolean),
      }
    },
  })

  registerTool({
    name: "product_opportunity_report",
    toolset: "admin",
    description:
      "Product opportunity intelligence: catalog gaps, products without variants, weak product activity, and demand signals from order lines.",
    risk: "read",
    schema: objectSchema({
      days: {
        type: "number",
        description: "Recent order window in days for product demand signals (default 90).",
      },
    }),
    handler: async (args, ctx: KamiCtx) => {
      const days = Math.max(1, num(args.days, 90))
      const since = new Date()
      since.setDate(since.getDate() - days)
      const [productsResult, ordersResult] = await Promise.all([
        graph(ctx, "product", {
          fields: [
            "id", "title", "handle", "status", "created_at", "updated_at",
            "variants.id", "variants.title", "variants.sku",
          ],
          limit: 200,
        }),
        graph(ctx, "order", {
          fields: [
            "id", "display_id", "total", "currency_code", "created_at",
            "items.id", "items.title", "items.product_id", "items.variant_id",
            "items.quantity", "items.unit_price", "items.variant.sku",
          ],
          limit: 500,
        }),
      ])
      const products = rows(productsResult)
      const recentOrders = rows(ordersResult).filter((order) => withinDays(order, since))
      const demand = new Map<string, {
        key: string
        product_id: string | null
        title: string
        quantity: number
        revenue: number
      }>()

      for (const order of recentOrders) {
        for (const item of asList(order.items)) {
          const productId = item.product_id ? String(item.product_id) : null
          const title = String(item.title ?? "unknown")
          const key = productId ?? title.toLowerCase()
          const quantity = num(item.quantity, 1)
          const revenue = quantity * num(item.unit_price)
          const current = demand.get(key) ?? {
            key,
            product_id: productId,
            title,
            quantity: 0,
            revenue: 0,
          }
          current.quantity += quantity
          current.revenue += revenue
          demand.set(key, current)
        }
      }

      const productsWithoutVariants = products
        .map((product) => ({
          product_id: product.id,
          title: product.title,
          handle: product.handle,
          status: product.status,
          variant_count: asList(product.variants).length,
        }))
        .filter((product) => product.variant_count === 0)
      const demandKeys = new Set([...demand.values()].map((item) => item.product_id ?? item.title.toLowerCase()))
      const productsWithoutDemand = products
        .filter((product) => {
          const byId = demandKeys.has(String(product.id))
          const byTitle = demandKeys.has(String(product.title ?? "").toLowerCase())

          return !byId && !byTitle
        })
        .slice(0, 50)
        .map((product) => ({
          product_id: product.id,
          title: product.title,
          status: product.status,
          variant_count: asList(product.variants).length,
        }))

      return {
        period_days: days,
        since: since.toISOString(),
        total_products: products.length,
        products_without_variants: productsWithoutVariants,
        products_without_demand: productsWithoutDemand,
        top_demand_signals: [...demand.values()]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 25),
        recommended_actions: [
          productsWithoutVariants.length > 0
            ? {
                label: "Fix products without variants",
                tool: "create_commerce_draft",
                args: {
                  draft_type: "product",
                  title: "Add missing product variants",
                  target_tool: "update_product",
                  args: {},
                  risk: "mutating",
                  confirm_required: true,
                  metadata: { product_count: productsWithoutVariants.length },
                },
                risk: "safe",
                confirm_required: false,
              }
            : null,
          productsWithoutDemand.length > 0
            ? {
                label: "Draft slow-product promotion",
                tool: "create_commerce_draft",
                args: {
                  draft_type: "promotion",
                  title: "Slow product promotion draft",
                  target_tool: "create_promotion",
                  args: {},
                  risk: "mutating",
                  confirm_required: true,
                  metadata: { product_count: productsWithoutDemand.length },
                },
                risk: "safe",
                confirm_required: false,
              }
            : null,
        ].filter(Boolean),
        data_quality: {
          order_line_product_ids_present: [...demand.values()].some((item) => Boolean(item.product_id)),
          confidence: [...demand.values()].some((item) => Boolean(item.product_id)) ? "medium" : "low",
          note: "Demand signals use order line product_id when present, otherwise title matching.",
        },
      }
    },
  })
}
