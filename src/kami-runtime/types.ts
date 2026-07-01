import type { MedusaContainer } from "@medusajs/framework/types"
import type KamiModuleService from "../modules/kami/services/kami-module-service"
import type { KamiExecutionContext } from "./security/execution-context"

export type KamiRole = "system" | "user" | "assistant" | "tool"
export type KamiToolRisk = "read" | "safe" | "mutating" | "destructive"
export type KamiAutonomyMode = "assist" | "copilot" | "autopilot"

export type KamiContentPart =
  | { type: "text"; text: string }
  | { type: "think"; think: string }
  | { type: "tool_call"; tool_name: string; args?: Record<string, unknown>; result?: unknown; risk?: KamiToolRisk }
  | { type: "trace"; steps: KamiTraceStep[] }
  | { type: "ui_command"; command: KamiUiCommand }
  | { type: "draft"; draft: KamiCommerceDraft; artifact_id?: string }
  | { type: "error"; error: string }

export type KamiChatMessage = {
  role: KamiRole
  content: string
  tool_call_id?: string
  tool_calls?: KamiProviderToolCall[]
  contentParts?: KamiContentPart[]
}

export type KamiToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type KamiProviderToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type KamiToolResult = {
  call: KamiToolCall
  result: unknown
}

export type KamiUiCommand = {
  action:
    | "open_panel"
    | "open_artifact"
    | "open_drawer"
    | "open_draft"
    | "focus_record"
    | "highlight_issue"
    | "request_confirmation"
  panel?: "report" | "draft" | "record" | "debug" | "approvals" | "memory" | "cron" | "settings" | "autonomy" | "evals"
  tab?: string
  artifact_id?: string
  draft_id?: string
  record_type?: "order" | "product" | "customer" | "inventory" | "promotion" | "region" | "other"
  record_id?: string
  title?: string
  reason?: string
  severity?: "info" | "warning" | "critical"
  metadata?: Record<string, unknown>
}

export type KamiCommerceDraft = {
  version: "1.0"
  draft_type:
    | "product"
    | "order"
    | "promotion"
    | "customer"
    | "campaign"
    | "inventory_adjustment"
    | "shipping_fix"
    | "schedule"
    | "report_template"
    | "custom"
  title: string
  description?: string
  status: "pending" | "executed" | "dismissed" | "approval_required" | "error"
  target_tool: string
  args: Record<string, unknown>
  risk: KamiToolRisk
  confirm_required: boolean
  created_at: string
  updated_at?: string
  executed_at?: string
  execution_result?: unknown
  timezone: "Asia/Ho_Chi_Minh"
  utc_offset: "UTC+7"
  metadata?: Record<string, unknown>
}

export type KamiTraceStep = {
  index: number
  tool: string
  status: "running" | "done" | "error"
  label: string
}

export type KamiEvent =
  | { type: "session"; session_id: string }
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string }
  | { type: "tool_start"; call: KamiToolCall; risk: KamiToolRisk }
  | { type: "tool_result"; call: KamiToolCall; result: unknown }
  | { type: "trace_step"; step: KamiTraceStep }
  | { type: "artifact_delta"; artifact_id: string; section_index: number; delta: unknown }
  | { type: "artifact_done"; artifact_id: string; payload: Record<string, unknown> }
  | { type: "quick_actions"; actions: unknown[] }
  | { type: "dashboard_suggestions"; suggestions: unknown[] }
  | { type: "ui_command"; command: KamiUiCommand }
  | { type: "draft_created"; artifact_id: string; draft: KamiCommerceDraft; artifact: unknown }
  | { type: "approval_required"; approval: unknown; call: KamiToolCall }
  | { type: "error"; message: string }
  | { type: "done"; text?: string; reason?: string }

export type KamiConfig = {
  model: string
  baseUrl: string
  apiKey?: string
  reasoningEffort: "low" | "medium" | "high"
  thinking: boolean
  maxIterations: number
  maxTokensPerTurn: number
  contextLimit: number
  approvalRequired: boolean
  destructiveTools: string[]
  halt: boolean
  mockLlm: boolean
  /** Fallback model used when the primary is unhealthy or rate-limited. */
  fallbackModel: string
  /** IANA timezone used for local business dates/times. */
  timezone: string
  /** Human-readable UTC offset for the configured timezone. */
  utcOffset: string
  /** Whether the provider healthcheck is active. */
  healthcheckEnabled: boolean
  /** Maximum number of retries for transient provider errors. */
  maxRetries: number
  /** Base delay (ms) for exponential backoff between retries. */
  retryDelayMs: number
  /** Whether the Docker sandbox for code_exec is enabled (Phase 5). */
  sandboxEnabled: boolean
  /** Docker image for sandbox (default alpine:3.20). */
  sandboxImage: string
  /** Max execution time in ms for code_exec (default 30000). */
  sandboxTimeoutMs: number
  /** Memory limit in MB for code_exec container (default 128). */
  sandboxMemoryMb: number
  /** Agent autonomy mode controlling when mutating/destructive tools need approval. */
  autonomyMode: KamiAutonomyMode
  /** Max mutating tool calls allowed in one autonomous turn before the agent must stop. */
  autonomyMaxMutationsPerTurn: number
  /** Whether destructive tools may run in autopilot mode without approval. */
  autonomyAllowDestructive: boolean
  /** Whether deterministic KAMI evaluation routes/tools are enabled. */
  evalHarnessEnabled: boolean
}

export type KamiCtx = {
  scope: MedusaContainer
  kami: KamiModuleService
  config: KamiConfig
  sessionId: string
  userId?: string
  toolset: string
  /** Privileged superuser scope used by mutating tools to invoke Medusa. */
  executor: KamiExecutionContext
}

export type TurnInput = {
  sessionId?: string
  message: string
  source?: "admin" | "cron" | "gateway" | "api"
  userId?: string
  toolset?: string
  /** Override the model for this turn (subagents use cheaper models). */
  model?: string
}
