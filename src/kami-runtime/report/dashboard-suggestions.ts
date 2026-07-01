import { graph } from "../tools/medusa/shared"
import type { KamiCtx } from "../types"

const count = (result: any) =>
  Array.isArray(result?.data) ? result.data.length : 0

export const buildDashboardSuggestions = async (ctx: KamiCtx) => {
  const [products, orders, customers, inventory] = await Promise.all([
    graph(ctx, "product", { limit: 5 }),
    graph(ctx, "order", { limit: 5 }),
    graph(ctx, "customer", { limit: 5 }),
    graph(ctx, "inventory_level", { limit: 50 }),
  ])

  const suggestions: Array<{
    label: string
    description?: string
    prompt: string
    kind: "report" | "inspect" | "create" | "schedule"
    tool?: string
    args?: Record<string, unknown>
    risk?: "read" | "safe" | "mutating" | "destructive"
    confirm_required?: boolean
    session_id?: string
  }> = []

  if (count(products) === 0) {
    suggestions.push({
      label: "Create the first product",
      prompt: "Help me create the first product with a default variant and price.",
      kind: "create",
      tool: "create_commerce_draft",
      args: {
        draft_type: "product",
        title: "Create First Product",
        description: "Draft the first product with a default variant and price for review.",
        target_tool: "create_product",
        args: {},
        risk: "mutating",
        confirm_required: true,
      },
      risk: "safe",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  } else {
    suggestions.push({
      label: "Check product catalog",
      prompt: "Create a product catalog health report.",
      kind: "inspect",
      tool: "product_opportunity_report",
      args: { days: 90 },
      risk: "read",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  }

  if (count(orders) === 0) {
    suggestions.push({
      label: "Review why there are no orders",
      prompt: "Check why the store has no orders and tell me what to fix first.",
      kind: "inspect",
      tool: "commerce_dashboard",
      args: { days: 30, low_stock_threshold: 5 },
      risk: "read",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  } else {
    suggestions.push({
      label: "Sales report",
      prompt: "Create a sales report for today with revenue, orders, customers, and inventory risk.",
      kind: "report",
      tool: "commerce_dashboard",
      args: { days: 1, low_stock_threshold: 5 },
      risk: "read",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  }

  if (count(customers) > 0 && count(orders) === 0) {
    suggestions.push({
      label: "Customers without orders",
      prompt: "Find customers who have not ordered and suggest a campaign.",
      kind: "report",
      tool: "customer_retention_report",
      args: { days: 90 },
      risk: "read",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  }

  const lowStock = (inventory.data ?? []).filter((item: any) =>
    Number(item.stocked_quantity ?? 0) - Number(item.reserved_quantity ?? 0) <= 5
  )

  if (lowStock.length > 0) {
    suggestions.push({
      label: `Low stock: ${lowStock.length} items`,
      prompt: "Create a low-stock report and suggest restock priorities.",
      kind: "inspect",
      tool: "inventory_report",
      args: { low_stock_threshold: 5 },
      risk: "read",
      confirm_required: false,
      session_id: ctx.sessionId,
    })
  }

  suggestions.push({
    label: "Schedule morning report",
    prompt: "Create a daily sales report schedule for every morning at 8:00.",
    kind: "schedule",
    tool: "create_commerce_draft",
    args: {
      draft_type: "schedule",
      title: "Daily Commerce Dashboard Schedule",
      description: "Create an automated morning commerce dashboard report at 8:00 local time.",
      target_tool: "schedule_task",
      args: {
        name: "Daily Commerce Dashboard",
        prompt: "Create a commerce dashboard for yesterday. Include revenue, orders, customers, product opportunities, inventory, and operations risks.",
        schedule_description: "every morning at 8am",
        deliver: "session",
      },
      risk: "mutating",
      confirm_required: true,
    },
    risk: "safe",
    confirm_required: false,
    session_id: ctx.sessionId,
  })

  return suggestions.slice(0, 6)
}
