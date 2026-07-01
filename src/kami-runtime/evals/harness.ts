import { buildReportArtifactPayload, REPORT_ARTIFACT_TOOLS } from "../report/artifact-builder"
import { buildQuickActions } from "../report/quick-actions"
import { evaluateAutonomy } from "../security/autonomy"
import { getTool, listTools } from "../tools/registry"
import type { KamiCtx, KamiToolResult } from "../types"

type EvalCheck = {
  id: string
  suite: "registry" | "reports" | "actions" | "autonomy"
  passed: boolean
  metric?: number
  details?: Record<string, unknown>
}

const check = (
  id: EvalCheck["id"],
  suite: EvalCheck["suite"],
  passed: boolean,
  details?: Record<string, unknown>,
  metric?: number
): EvalCheck => ({
  id,
  suite,
  passed,
  details,
  metric,
})

const sampleResults = (): KamiToolResult[] => [
  {
    call: {
      id: "eval_commerce_dashboard",
      name: "commerce_dashboard",
      arguments: { days: 30, low_stock_threshold: 5 },
    },
    result: {
      currency: "vnd",
      kpis: {
        products: 12,
        customers: 40,
        orders_in_period: 84,
        revenue_in_period: 125000000,
        operational_risk_score: 45,
      },
      daily_revenue: [
        { date: "2026-07-01", orders: 3, revenue: 4500000 },
        { date: "2026-07-02", orders: 4, revenue: 7200000 },
      ],
      operational_issues: [
        { severity: "warning", category: "inventory", title: "Low-stock inventory items", count: 2 },
      ],
      next_best_actions: [
        { label: "Open risk report", tool: "operations_risk_report", risk: "read" },
      ],
    },
  },
  {
    call: {
      id: "eval_operations_risk",
      name: "operations_risk_report",
      arguments: { low_stock_threshold: 5 },
    },
    result: {
      risk_score: 30,
      issues: [
        { severity: "warning", category: "inventory", title: "Low-stock inventory items", count: 2 },
      ],
      low_stock_items: [
        { inventory_item_id: "i_1", location_id: "loc_1", available: 2, incoming_quantity: 0 },
      ],
      unpaid_orders: [],
    },
  },
  {
    call: {
      id: "eval_retention",
      name: "customer_retention_report",
      arguments: { days: 90 },
    },
    result: {
      total_customers: 40,
      segments: { no_orders: 10, one_time: 12, repeat: 18, stale: 4 },
      top_customers: [
        { email: "buyer@example.com", name: "Buyer", order_count: 5, total_spent: 12000000 },
      ],
      customers_without_orders: [
        { email: "lead@example.com", name: "Lead", created_at: "2026-07-01T00:00:00.000Z" },
      ],
    },
  },
]

export const runKamiEvaluationHarness = (ctx: Pick<KamiCtx, "config" | "sessionId">) => {
  const tools = listTools("admin")
  const toolNames = new Set(tools.map((tool) => tool.name))
  const checks: EvalCheck[] = []

  for (const toolName of REPORT_ARTIFACT_TOOLS) {
    checks.push(check(
      `registry:${toolName}`,
      "registry",
      toolNames.has(toolName),
      { tool: toolName }
    ))
  }

  for (const toolName of ["create_commerce_draft", "export_artifact_csv", "ui_command", "autonomy_status", "autonomy_plan", "evaluation_run"]) {
    checks.push(check(
      `registry:${toolName}`,
      "registry",
      toolNames.has(toolName),
      { tool: toolName }
    ))
  }

  const artifact = buildReportArtifactPayload({
    title: "KAMI Eval Report",
    userMessage: "Create a commerce dashboard",
    results: sampleResults(),
  })
  const sectionTypes = new Set(artifact.sections.map((section) => section.type))
  checks.push(check(
    "reports:artifact_has_kpi",
    "reports",
    sectionTypes.has("kpi"),
    { section_types: [...sectionTypes] }
  ))
  checks.push(check(
    "reports:artifact_has_table",
    "reports",
    sectionTypes.has("table"),
    { section_types: [...sectionTypes] }
  ))
  checks.push(check(
    "reports:artifact_has_chart",
    "reports",
    sectionTypes.has("chart"),
    { section_types: [...sectionTypes] }
  ))

  const actions = buildQuickActions({
    sessionId: ctx.sessionId,
    artifactId: "art_eval",
    userMessage: "Create a commerce dashboard",
    results: sampleResults(),
  })
  const invalidActions = actions.filter((action) => !getTool(action.tool))
  checks.push(check(
    "actions:all_targets_registered",
    "actions",
    invalidActions.length === 0,
    {
      action_count: actions.length,
      invalid_tools: invalidActions.map((action) => action.tool),
    },
    actions.length
  ))
  checks.push(check(
    "actions:contains_real_tool_action",
    "actions",
    actions.some((action) => action.tool !== "finish" && action.tool !== "ui_command"),
    { tools: actions.map((action) => action.tool) }
  ))

  const deleteProduct = getTool("delete_product")
  const createProduct = getTool("create_product")
  if (deleteProduct) {
    const destructiveDecision = evaluateAutonomy(deleteProduct, ctx.config)
    checks.push(check(
      "autonomy:destructive_requires_approval",
      "autonomy",
      destructiveDecision.approval_required === true || ctx.config.autonomyAllowDestructive === true,
      destructiveDecision
    ))
  }
  if (createProduct) {
    const mutatingDecision = evaluateAutonomy(createProduct, ctx.config)
    checks.push(check(
      "autonomy:mutating_policy_defined",
      "autonomy",
      mutatingDecision.allowed === true,
      mutatingDecision
    ))
  }

  const passed = checks.filter((item) => item.passed).length
  const failed = checks.length - passed

  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    session_id: ctx.sessionId,
    totals: {
      checks: checks.length,
      passed,
      failed,
      pass_rate: checks.length ? passed / checks.length : 0,
    },
    suites: {
      registry: checks.filter((item) => item.suite === "registry"),
      reports: checks.filter((item) => item.suite === "reports"),
      actions: checks.filter((item) => item.suite === "actions"),
      autonomy: checks.filter((item) => item.suite === "autonomy"),
    },
    checks,
  }
}
