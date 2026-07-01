/**
 * Quick Actions v2 — data-driven, no hardcoded if-else blocks.
 *
 * The old approach had 6 hardcoded if-else patterns matching specific tools
 * and keywords. Now we collect actions from:
 *   1. suggest_action tool calls during the turn (primary — LLM-driven)
 *   2. Report tool results that contain embedded action suggestions
 *   3. A minimal fallback set based on which tools were used
 */

import type { KamiToolResult } from "../types"
import type { QuickActionPayload } from "./types"

const asRecord = (value: unknown): Record<string, any> => {
  if (!value) return {}
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return {} }
  }
  return typeof value === "object" ? value as Record<string, any> : {}
}

/** Tools that may embed suggested actions in their results. */
const ACTION_EMBEDDING_TOOLS = [
  "commerce_dashboard",
  "operations_risk_report",
  "customer_retention_report",
  "product_opportunity_report",
  "render_artifact",
]

export const buildQuickActions = (input: {
  sessionId: string
  artifactId?: string
  userMessage: string
  results: KamiToolResult[]
}): QuickActionPayload[] => {
  const actions: QuickActionPayload[] = []
  const tools = new Set(input.results.map((r) => r.call.name))

  // 1. Collect actions from suggest_action tool calls (primary — LLM-driven)
  for (const result of input.results) {
    if (result.call.name === "suggest_action") {
      const data = asRecord(result.result)
      if (data.action) {
        actions.push({
          label: data.action.label || "Action",
          description: data.action.description || "",
          kind: (data.action.kind as QuickActionPayload["kind"]) || "inspect",
          tool: data.action.tool || "graph",
          args: data.action.args || {},
          risk: (data.action.risk as QuickActionPayload["risk"]) || "read",
          confirm_required: data.action.confirm_required ?? false,
          artifact_id: input.artifactId,
          session_id: input.sessionId,
        })
      }
      // Array of actions
      if (Array.isArray(data.actions)) {
        for (const action of data.actions) {
          actions.push({
            label: action.label || "Action",
            description: action.description || "",
            kind: (action.kind as QuickActionPayload["kind"]) || "inspect",
            tool: action.tool || "graph",
            args: action.args || {},
            risk: (action.risk as QuickActionPayload["risk"]) || "read",
            confirm_required: action.confirm_required ?? false,
            artifact_id: input.artifactId,
            session_id: input.sessionId,
          })
        }
      }
    }
  }

  // 2. Extract embedded next_best_actions / suggested_actions from report tools
  for (const result of input.results) {
    if (ACTION_EMBEDDING_TOOLS.includes(result.call.name)) {
      const data = asRecord(result.result)
      const embeddedActions =
        data.next_best_actions ||
        data.suggested_actions ||
        data.recommendations ||
        []

      if (Array.isArray(embeddedActions)) {
        for (const action of embeddedActions.slice(0, 5)) {
          actions.push({
            label: action.label || action.title || "Action",
            description: action.description || action.reason || "",
            kind: "inspect",
            tool: action.tool || "graph",
            args: action.args || {},
            risk: (action.risk as QuickActionPayload["risk"]) || "read",
            confirm_required: action.confirm_required ?? false,
            artifact_id: input.artifactId,
            session_id: input.sessionId,
          })
        }
      }
    }
  }

  // 3. Render_artifact action_list sections
  for (const result of input.results) {
    if (result.call.name === "render_artifact") {
      const data = asRecord(result.result)
      const sections = data.payload?.sections || data.sections || []
      for (const section of sections) {
        if (section.type === "action_list" && Array.isArray(section.actions)) {
          for (const action of section.actions) {
            actions.push({
              label: action.label || "Action",
              description: action.description || "",
              kind: "inspect",
              tool: action.tool || "graph",
              args: action.args || {},
              risk: (action.risk as QuickActionPayload["risk"]) || "read",
              confirm_required: action.confirm_required ?? false,
              artifact_id: input.artifactId,
              session_id: input.sessionId,
            })
          }
        }
      }
    }
  }

  // 4. Fallback: if we have an artifact, always offer export
  if (input.artifactId && !actions.some((a) => a.kind === "export")) {
    actions.push({
      label: "Export CSV",
      description: "Download the current report tables as a CSV file.",
      kind: "export",
      tool: "export_artifact_csv",
      args: { artifact_id: input.artifactId },
      risk: "read",
      confirm_required: false,
      artifact_id: input.artifactId,
      session_id: input.sessionId,
    })
  }

  // Deduplicate by label
  const seen = new Set<string>()
  const unique = actions.filter((a) => {
    const key = `${a.label}:${a.tool}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return unique.slice(0, 8)
}
