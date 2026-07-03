/* ------------------------------------------------------------------ */
/*  Shared Types                                                       */
/* ------------------------------------------------------------------ */

export type Row = Record<string, any>

export type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system"
  content: string
  tool_calls?: Row[]
  content_parts?: ContentPart[]
  metadata?: Row
  created_at?: string
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "think"; think: string }
  | { type: "tool_call"; tool_name: string; args?: Row; result?: unknown; risk?: string }
  | { type: "trace"; steps: TraceStep[] }
  | { type: "ui_command"; command: UiCommand }
  | { type: "draft"; draft: CommerceDraftPayload; artifact_id?: string }
  | { type: "approval"; approval: Row; decided?: "approved" | "rejected" }
  | { type: "error"; error: string }

export type TabId = "approvals" | "audit" | "memory" | "skills" | "cron" | "gateways" | "settings" | "autonomy" | "evals"

export type TraceStep = {
  index: number
  tool: string
  status: "running" | "done" | "error"
  label: string
}

export type QuickAction = {
  label: string
  description?: string
  kind: "create" | "export" | "schedule" | "inspect" | "fix" | "report" | "draft"
  tool: string
  args: Row
  risk: string
  confirm_required?: boolean
  artifact_id?: string
  session_id?: string
}

export type UiCommand = {
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
  metadata?: Row
}

export type CommerceDraftPayload = {
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
  args: Row
  risk: "read" | "safe" | "mutating" | "destructive"
  confirm_required: boolean
  created_at: string
  updated_at?: string
  executed_at?: string
  execution_result?: unknown
  timezone: "Asia/Ho_Chi_Minh"
  utc_offset: "UTC+7"
  metadata?: Row
}

export type VoiceConfig = {
  provider: "openai"
  enabled: boolean
  modes: {
    send: boolean
    realtime: boolean
  }
  auto_detect_language: boolean
  model: string
  realtime_model: string
  realtime_transcription_model: string
  sample_rate: number
  realtime: {
    enabled: boolean
    ws_url_base?: string | null
    port?: number
    model?: string
    transcription_model?: string
    auto_detect_language?: boolean
    error?: string | null
  }
}

export type VoiceState = "idle" | "recording" | "transcribing" | "sending" | "speaking" | "connecting" | "live"

export type ArtifactSection =
  | { type: "kpi"; title: string; cards: Array<{ label: string; value: string; trend?: string; delta?: string }> }
  | { type: "table"; title: string; columns: Array<{ key: string; label: string; align?: string }>; rows: Row[]; total_rows: number }
  | { type: "chart"; title: string; chart_type: string; data: { labels: string[]; datasets: Array<{ label: string; values: number[] }> } }
  | { type: "text"; title?: string; content: string }

export type ArtifactPayload = {
  version: "1.0"
  title: string
  generated_at: string
  timezone: string
  utc_offset: string
  date_range: { from: string; to: string; label: string }
  sections: ArtifactSection[]
  data_sources: Array<{ tool: string; run_at: string; row_count: number }>
}
