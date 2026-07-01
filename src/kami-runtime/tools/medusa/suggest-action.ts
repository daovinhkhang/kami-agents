/**
 * suggest_action — LLM-driven quick action suggestions.
 *
 * Replaces the 6 hardcoded if-else blocks in quick-actions.ts.
 * The LLM calls this tool to suggest follow-up actions based on
 * the data it has seen and the user's intent.
 *
 * Each action becomes a clickable button in the chat UI.
 */

import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

export const suggestActionHandler = async (args: Record<string, unknown>, _ctx: KamiCtx) => {
  const action = args.action as Record<string, unknown> | undefined
  const actions = args.actions as Array<Record<string, unknown>> | undefined

  const result: { actions: Array<Record<string, unknown>> } = { actions: [] }

  if (action) {
    result.actions.push({
      label: action.label || "Action",
      description: action.description || "",
      kind: action.kind || "inspect",
      tool: action.tool || "graph",
      args: action.args || {},
      risk: action.risk || "read",
      confirm_required: action.confirm_required ?? false,
    })
  }

  if (Array.isArray(actions)) {
    for (const a of actions) {
      result.actions.push({
        label: a.label || "Action",
        description: a.description || "",
        kind: a.kind || "inspect",
        tool: a.tool || "graph",
        args: a.args || {},
        risk: a.risk || "read",
        confirm_required: a.confirm_required ?? false,
      })
    }
  }

  return result
}

export const registerSuggestActionTool = () => {
  registerTool({
    name: "suggest_action",
    toolset: "admin",
    description:
      "Suggest follow-up actions as clickable buttons in the chat. " +
      "Use after reports, inspections, or when the user might want to take action. " +
      "Each action has a label, description, kind (create/export/schedule/inspect/fix/report/draft), " +
      "target tool name, and optional pre-filled args. " +
      "Suggest 1-4 relevant actions based on what was just discovered. " +
      "Examples: 'Export CSV', 'Check inventory again', 'Draft a promotion', 'Schedule daily report'.",
    risk: "safe",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "object",
          description: "A single suggested action",
          properties: {
            label: { type: "string", description: "Button label, e.g. 'Export CSV'" },
            description: { type: "string", description: "What this action does" },
            kind: {
              type: "string",
              enum: ["create", "export", "schedule", "inspect", "fix", "report", "draft"],
              description: "Action kind",
            },
            tool: { type: "string", description: "KAMI tool to call when clicked" },
            args: { type: "object", description: "Pre-filled arguments for the tool" },
            risk: { type: "string", enum: ["read", "safe", "mutating", "destructive"] },
            confirm_required: { type: "boolean" },
          },
          required: ["label", "tool"],
        },
        actions: {
          type: "array",
          description: "Multiple suggested actions (preferred over single action)",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
              kind: { type: "string", enum: ["create", "export", "schedule", "inspect", "fix", "report", "draft"] },
              tool: { type: "string" },
              args: { type: "object" },
              risk: { type: "string", enum: ["read", "safe", "mutating", "destructive"] },
              confirm_required: { type: "boolean" },
            },
            required: ["label", "tool"],
          },
        },
      },
    },
    handler: suggestActionHandler,
  })
}
