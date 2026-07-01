import type { ReportTemplate } from "./types"

export const BUILT_IN_REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "commerce-dashboard",
    name: "commerce-dashboard",
    title: "Commerce Intelligence Dashboard",
    description: "One panel for sales, catalog, customers, inventory, fulfillment risks, and next-best actions.",
    prompt:
      "Create a commerce intelligence dashboard. Use commerce_dashboard with days=30 and low_stock_threshold=5. Keep the chat answer short and open the report panel.",
    required_tools: ["commerce_dashboard"],
    category: "operations",
    schedule_presets: [
      { label: "Every morning 8:00", schedule: "0 8 * * *" },
      { label: "Every Monday 8:00", schedule: "0 8 * * 1" },
    ],
  },
  {
    id: "today-sales",
    name: "today-sales",
    title: "Today Sales Report",
    description: "Revenue, orders, customers, product activity, and low-stock risk for today.",
    prompt:
      "Create a business report for today. Use order_analytics, customer_insights, product_performance, and inventory_report. Include KPIs, recent orders, top customers, product status, low stock, and daily revenue.",
    required_tools: ["order_analytics", "customer_insights", "product_performance", "inventory_report"],
    category: "sales",
    schedule_presets: [
      { label: "Every morning 8:00", schedule: "0 8 * * *" },
      { label: "Every evening 20:00", schedule: "0 20 * * *" },
    ],
  },
  {
    id: "weekly-sales",
    name: "weekly-sales",
    title: "Weekly Sales Report",
    description: "Seven-day sales health with order status, customer activity, and inventory risks.",
    prompt:
      "Create a weekly sales report for the last 7 days. Use order_analytics with days=7, customer_insights with days=7, product_performance, and inventory_report.",
    required_tools: ["order_analytics", "customer_insights", "product_performance", "inventory_report"],
    category: "sales",
    schedule_presets: [{ label: "Every Monday 8:00", schedule: "0 8 * * 1" }],
  },
  {
    id: "profit-loss",
    name: "profit-loss",
    title: "Profit And Loss",
    description: "Revenue and profit estimate with explicit confidence and cost-data caveats.",
    prompt:
      "Create a profit and loss report for the last 30 days. Use profit_loss_report. If cost data is missing, do not invent profit; state the caveats clearly.",
    required_tools: ["profit_loss_report"],
    category: "finance",
    schedule_presets: [{ label: "Every month 8:00", schedule: "0 8 1 * *" }],
  },
  {
    id: "operations-risk",
    name: "operations-risk",
    title: "Operations Risk",
    description: "Fulfillment setup, unpaid/unfulfilled orders, low stock, and catalog blockers.",
    prompt:
      "Create an operations risk report. Use operations_risk_report with low_stock_threshold=5. Highlight exact blockers and next tools to run.",
    required_tools: ["operations_risk_report"],
    category: "operations",
    schedule_presets: [
      { label: "Every 30 minutes", schedule: "*/30 * * * *" },
      { label: "Every morning 8:00", schedule: "0 8 * * *" },
    ],
  },
  {
    id: "customer-retention",
    name: "customer-retention",
    title: "Customer Retention",
    description: "Customers without orders, stale customers, repeat customers, and retention actions.",
    prompt:
      "Create a customer retention report. Use customer_retention_report with days=90. Include customers without orders, stale customers, repeat customers, and draftable actions.",
    required_tools: ["customer_retention_report"],
    category: "customers",
    schedule_presets: [{ label: "Every Monday 8:00", schedule: "0 8 * * 1" }],
  },
  {
    id: "product-opportunity",
    name: "product-opportunity",
    title: "Product Opportunity",
    description: "Catalog gaps, products without variants, and weak demand signals.",
    prompt:
      "Create a product opportunity report. Use product_opportunity_report with days=90. Highlight products without variants, products without demand signals, and next actions.",
    required_tools: ["product_opportunity_report"],
    category: "products",
    schedule_presets: [{ label: "Every Monday 8:00", schedule: "0 8 * * 1" }],
  },
  {
    id: "new-customers",
    name: "new-customers",
    title: "New Customers",
    description: "Recent customer acquisition and customers who have not ordered yet.",
    prompt:
      "Analyze new customers and customer activity. Use customer_insights and list_customers. Highlight newly created customers and customers without orders.",
    required_tools: ["customer_insights", "list_customers"],
    category: "customers",
  },
  {
    id: "low-stock",
    name: "low-stock",
    title: "Low Stock",
    description: "Low-stock inventory items and location-level stock risk.",
    prompt:
      "Create a low-stock inventory report. Use inventory_report with low_stock_threshold=5. Highlight stockouts, low availability, and items that need replenishment.",
    required_tools: ["inventory_report"],
    category: "inventory",
    schedule_presets: [
      { label: "Every 30 minutes", schedule: "*/30 * * * *" },
      { label: "Every evening 19:00", schedule: "0 19 * * *" },
    ],
  },
  {
    id: "orders-to-process",
    name: "orders-to-process",
    title: "Orders To Process",
    description: "Orders that need fulfillment, payment review, or operations follow-up.",
    prompt:
      "Review orders that need processing. Use list_orders and order_analytics. Identify pending, unfulfilled, unpaid, canceled, or error-prone orders.",
    required_tools: ["list_orders", "order_analytics"],
    category: "orders",
  },
  {
    id: "channel-revenue",
    name: "channel-revenue",
    title: "Revenue By Channel",
    description: "Sales-channel oriented revenue summary where store data supports it.",
    prompt:
      "Create a revenue-by-channel report. Use order_analytics, list_orders, and sales summary tools when available. Explain any missing channel data explicitly.",
    required_tools: ["order_analytics", "list_orders"],
    category: "sales",
  },
  {
    id: "slow-products",
    name: "slow-products",
    title: "Slow Products",
    description: "Products with weak activity, missing variants, or catalog completeness issues.",
    prompt:
      "Create a slow-products and catalog health report. Use product_performance and list_products. Highlight draft products, products without variants, and products that may need promotion.",
    required_tools: ["product_performance", "list_products"],
    category: "products",
  },
]

export const findReportTemplate = (idOrName: string) =>
  BUILT_IN_REPORT_TEMPLATES.find((template) =>
    template.id === idOrName || template.name === idOrName
  )
