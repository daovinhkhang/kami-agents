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
      // Build a simple text summary for each report tool
      const keyCount = Object.keys(data).length
      const summary = typeof result.result === "string"
        ? result.result.slice(0, 500)
        : JSON.stringify(data, null, 0).slice(0, 500)

      sections.push({
        type: "text",
        title: result.call.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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
  kami: any,
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
