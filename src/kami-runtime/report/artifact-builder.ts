/**
 * Artifact Builder v2 — LLM-driven, no hardcoded structures.
 *
 * The old approach (keyword matching + 9 if-else blocks per tool) is gone.
 * Now the LLM calls render_artifact tool directly during the turn, and this
 * module provides merge/persistence utilities.
 *
 * shouldCreateArtifact is replaced by a simple heuristic: if any tool from
 * REPORT_ARTIFACT_TOOLS was called, we still generate a default artifact as
 * fallback. But the primary path is LLM-driven via render_artifact.
 */

import type { ArtifactPayload, ArtifactSection, ArtifactDelta } from "./types"
import type { KamiToolResult } from "../types"
import type KamiModuleService from "../../modules/kami/services/kami-module-service"
import { getTurnArtifact } from "../tools/medusa/render-artifact"

/** Tools whose results typically feed into reports. */
export const REPORT_ARTIFACT_TOOLS = [
  "order_analytics",
  "inventory_report",
  "customer_insights",
  "product_performance",
  "sales_summary",
  "commerce_dashboard",
  "profit_loss_report",
  "operations_risk_report",
  "customer_retention_report",
  "product_opportunity_report",
  "render_artifact",
]

const asRecord = (value: unknown): Record<string, any> => {
  if (!value) return {}
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return {} }
  }
  return typeof value === "object" ? value as Record<string, any> : {}
}

const countRows = (value: unknown): number => {
  const record = asRecord(value)
  if (Array.isArray(record.data)) return record.data.length
  for (const item of Object.values(record)) {
    if (Array.isArray(item)) return item.length
  }
  return Object.keys(record).length
}

const titleize = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())

const formatValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("vi-VN") : value.toFixed(2)
  }
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (value === null || value === undefined) return "-"
  return String(value)
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const objectTable = (
  title: string,
  rows: unknown[],
  preferredKeys: string[] = []
): ArtifactSection | null => {
  const objectRows = rows.filter(isPlainRecord)
  if (!objectRows.length) return null

  const keys = [
    ...preferredKeys.filter((key) => objectRows.some((row) => row[key] !== undefined)),
    ...Object.keys(objectRows[0]).filter((key) => !preferredKeys.includes(key)),
  ].slice(0, 8)

  if (!keys.length) return null

  return {
    type: "table",
    title,
    columns: keys.map((key) => ({
      key,
      label: titleize(key),
      align: typeof objectRows[0][key] === "number" ? "right" : "left",
      format: typeof objectRows[0][key] === "number" ? "number" : "text",
    })),
    rows: objectRows.slice(0, 50),
    total_rows: objectRows.length,
  }
}

const numericKpiSection = (
  title: string,
  values: Record<string, unknown>,
  preferredKeys: string[] = []
): ArtifactSection | null => {
  const keys = [
    ...preferredKeys.filter((key) => values[key] !== undefined),
    ...Object.keys(values).filter((key) => !preferredKeys.includes(key)),
  ].filter((key) => ["string", "number", "boolean"].includes(typeof values[key]))

  if (!keys.length) return null

  return {
    type: "kpi",
    title,
    cards: keys.slice(0, 8).map((key) => ({
      label: titleize(key),
      value: formatValue(values[key]),
    })),
  }
}

const timeSeriesChart = (
  title: string,
  rows: unknown[],
  metricKey = "revenue"
): ArtifactSection | null => {
  const objectRows = rows.filter(isPlainRecord)
  if (!objectRows.length) return null
  if (!objectRows.some((row) => row.date !== undefined || row.period !== undefined || row.label !== undefined)) return null

  const labels = objectRows.map((row, index) =>
    formatValue(row.date ?? row.period ?? row.label ?? index + 1)
  )
  const values = objectRows.map((row) => Number(row[metricKey] ?? row.value ?? row.orders ?? 0))

  if (!values.some((value) => Number.isFinite(value) && value > 0)) return null

  return {
    type: "chart",
    title,
    chart_type: "line",
    data: {
      labels,
      datasets: [
        {
          label: titleize(metricKey),
          values: values.map((value) => (Number.isFinite(value) ? value : 0)),
        },
      ],
    },
  }
}

const actionListSection = (
  title: string,
  actions: unknown[]
): ArtifactSection | null => {
  const objectActions = actions.filter(isPlainRecord)
  if (!objectActions.length) return null

  return {
    type: "action_list",
    title,
    actions: objectActions.slice(0, 8).map((action) => ({
      label: formatValue(action.label ?? action.title ?? "Action"),
      description: formatValue(action.description ?? action.reason ?? action.category ?? ""),
      tool: formatValue(action.tool ?? action.recommended_tool ?? "finish"),
      args: isPlainRecord(action.args) ? action.args : {},
      risk: typeof action.risk === "string" ? action.risk as any : "read",
      confirm_required: Boolean(action.confirm_required),
    })),
  }
}

const structuredSectionsFromReport = (
  toolName: string,
  data: Record<string, any>
): ArtifactSection[] => {
  const sections: ArtifactSection[] = []
  const reportTitle = titleize(toolName)

  if (isPlainRecord(data.kpis)) {
    const section = numericKpiSection("Key Metrics", data.kpis, [
      "revenue_in_period",
      "orders_in_period",
      "products",
      "customers",
      "operational_risk_score",
    ])
    if (section) sections.push(section)
  }

  if (isPlainRecord(data.segments)) {
    const section = numericKpiSection("Customer Segments", data.segments, [
      "repeat",
      "one_time",
      "no_orders",
      "stale",
    ])
    if (section) sections.push(section)
  }

  if (data.risk_score !== undefined) {
    const section = numericKpiSection("Risk Summary", { risk_score: data.risk_score })
    if (section) sections.push(section)
  }

  if (data.summary && isPlainRecord(data.summary)) {
    const section = numericKpiSection("Summary", data.summary)
    if (section) sections.push(section)
  }

  if (Array.isArray(data.daily_revenue)) {
    const section = timeSeriesChart("Revenue by Day", data.daily_revenue, "revenue")
    if (section) sections.push(section)
  }

  const tableCandidates: Array<[string, unknown[], string[]]> = [
    ["Operational Issues", data.operational_issues, ["severity", "category", "title", "count"]],
    ["Issues", data.issues, ["severity", "category", "title", "count"]],
    ["Low Stock Items", data.low_stock_items, ["inventory_item_id", "location_id", "available", "incoming_quantity"]],
    ["Top Customers", data.top_customers, ["email", "name", "order_count", "total_spent"]],
    ["Customers Without Orders", data.customers_without_orders, ["email", "name", "created_at"]],
    ["Top Products", data.top_products, ["title", "sales_count", "revenue"]],
    ["Products", data.products, ["title", "status", "variant_count", "sales_count"]],
    ["Orders", data.orders, ["display_id", "status", "payment_status", "total"]],
  ]

  for (const [title, rows, keys] of tableCandidates) {
    if (!Array.isArray(rows)) continue
    const section = objectTable(title, rows, keys)
    if (section) sections.push(section)
  }

  if (Array.isArray(data.next_best_actions)) {
    const section = actionListSection("Next Best Actions", data.next_best_actions)
    if (section) sections.push(section)
  }

  if (!sections.length) {
    const section = numericKpiSection(reportTitle, data)
    if (section) sections.push(section)
  }

  return sections
}

/**
 * Check if the turn likely produced a report artifact.
 * Now only returns true if render_artifact was explicitly called
 * OR a known report tool was used (as fallback).
 */
export const shouldCreateArtifact = (_message: string, results: KamiToolResult[]): boolean => {
  // Primary: was render_artifact called?
  if (results.some((r) => r.call.name === "render_artifact")) {
    return true
  }
  // Fallback: a report tool ran but render_artifact wasn't called
  return results.some((r) => REPORT_ARTIFACT_TOOLS.includes(r.call.name))
}

/**
 * Build a fallback artifact payload when the LLM didn't call render_artifact
 * but report tools were used. Uses the in-memory turn artifact if available,
 * otherwise creates a minimal text-based report from tool results.
 */
export const buildReportArtifactPayload = (
  input: {
    title?: string
    userMessage: string
    results: KamiToolResult[]
  }
): ArtifactPayload => {
  const generatedAt = new Date().toISOString()
  const dataSources = input.results.map((r) => ({
    tool: r.call.name,
    run_at: generatedAt,
    row_count: countRows(r.result),
  }))

  // Check if render_artifact already built something in-memory
  // (we can't access ctx here, so we build a fresh fallback)
  const sections: ArtifactSection[] = []

  // Build a minimal text summary from each report tool result
  for (const result of input.results) {
    if (result.call.name === "render_artifact") {
      const artifactResult = result.result as any
      if (artifactResult?.payload?.sections) {
        sections.push(...artifactResult.payload.sections)
      }
      continue
    }

    if (REPORT_ARTIFACT_TOOLS.includes(result.call.name)) {
      const data = asRecord(result.result)
      const structuredSections = structuredSectionsFromReport(result.call.name, data)
      if (structuredSections.length) {
        sections.push(...structuredSections)
        continue
      }

      // Last-resort text summary for report outputs that do not contain structured fields.
      const keyCount = Object.keys(data).length
      const summary = typeof result.result === "string"
        ? result.result.slice(0, 500)
        : JSON.stringify(data, null, 0).slice(0, 500)

      sections.push({
        type: "text",
        title: titleize(result.call.name),
        content: summary || `Tool returned ${keyCount} data fields.`,
      })
    }
  }

  if (!sections.length) {
    sections.push({
      type: "text",
      title: "Report",
      content: "No structured report data was generated. Try asking for specific analytics like sales, inventory, or customer insights.",
    })
  }

  return {
    version: "1.0",
    title: input.title ?? "KAMI Commerce Report",
    generated_at: generatedAt,
    timezone: "Asia/Ho_Chi_Minh",
    utc_offset: "UTC+7",
    date_range: {
      from: generatedAt,
      to: generatedAt,
      label: "Current business context",
    },
    sections,
    data_sources: dataSources,
  }
}

/**
 * Merge an ArtifactDelta into an existing payload.
 * Used for incremental updates during a turn.
 */
export const mergeArtifactDelta = (
  existing: ArtifactPayload,
  delta: ArtifactDelta
): ArtifactPayload => {
  const merged = { ...existing, sections: [...existing.sections] }

  switch (delta.action) {
    case "create":
      if (delta.payload) return { ...delta.payload }
      break
    case "append":
      if (delta.sections) merged.sections.push(...delta.sections)
      break
    case "replace":
      if (delta.sections) merged.sections = [...delta.sections]
      break
    case "update_section":
      if (delta.section_index !== undefined && delta.section) {
        merged.sections[delta.section_index] = delta.section
      }
      break
  }

  merged.generated_at = new Date().toISOString()
  return merged
}

/**
 * Persist artifact to DB.
 */
export const createAndPersistArtifact = async (
  kami: KamiModuleService,
  sessionId: string,
  payload: ArtifactPayload
) => {
  const [artifact] = await kami.createKamiArtifacts([
    {
      session_id: sessionId,
      type: "report",
      title: payload.title,
      schema_version: payload.version,
      payload,
      metadata: {
        generated_at: payload.generated_at,
        timezone: payload.timezone,
        utc_offset: payload.utc_offset,
        data_sources: payload.data_sources,
      },
    },
  ])

  return artifact
}
