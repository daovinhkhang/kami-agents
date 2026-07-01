// ---- KAMI DTOs (Phase 0 subset: session + message) ----

export type KamiSessionSource = "admin" | "cron" | "gateway" | "api"
export type KamiSessionStatus = "active" | "completed" | "halted" | "error"

export interface KamiSessionDTO {
  id: string
  title: string | null
  source: KamiSessionSource
  user_id: string | null
  parent_session_id: string | null
  status: KamiSessionStatus
  message_count: number
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export type KamiMessageRole = "user" | "assistant" | "tool" | "system"

export interface KamiToolCall {
  id: string
  type?: "function"
  name: string
  arguments: string
}

export interface KamiMessageDTO {
  id: string
  session_id: string
  role: KamiMessageRole
  content: string | null
  tool_calls: KamiToolCall[] | null
  tool_call_id: string | null
  reasoning: Record<string, unknown> | null
  tokens_in: number
  tokens_out: number
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface FilterableKamiSessionProps {
  id?: string | string[]
  user_id?: string | string[]
  status?: KamiSessionStatus | KamiSessionStatus[]
  source?: KamiSessionSource | KamiSessionSource[]
}

export interface FilterableKamiMessageProps {
  id?: string | string[]
  session_id?: string | string[]
  role?: KamiMessageRole | KamiMessageRole[]
}

export type KamiRiskLevel = "read" | "safe" | "mutating" | "destructive"
export type KamiSkillOrigin = "agent" | "human" | "hub"
export type KamiMemoryType =
  | "factual"
  | "preference"
  | "goal"
  | "instruction"
  | "event"
export type KamiApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"

export interface KamiSkillDTO {
  id: string
  name: string
  description: string | null
  category: string | null
  version: string
  content: string
  frontmatter: Record<string, unknown> | null
  origin: KamiSkillOrigin
  platforms: Record<string, unknown> | null
  disabled: boolean
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface KamiMemoryDTO {
  id: string
  user_id: string | null
  session_id: string | null
  type: KamiMemoryType
  content: string
  importance: number
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface KamiJobDTO {
  id: string
  name: string
  prompt: string
  schedule: string
  deliver: Record<string, unknown> | null
  session_id: string | null
  enabled: boolean
  next_run_at: string | Date | null
  last_run_at: string | Date | null
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface KamiAuditLogDTO {
  id: string
  session_id: string | null
  tool: string
  args: Record<string, unknown> | null
  result_summary: string | null
  risk_level: KamiRiskLevel
  actor: "kami" | "human"
  approved_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface KamiApprovalDTO {
  id: string
  session_id: string | null
  tool: string
  args: Record<string, unknown> | null
  status: KamiApprovalStatus
  requested_at: string | Date | null
  decided_by: string | null
  decided_at: string | Date | null
  execution_result: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export type KamiArtifactType = "report" | "table" | "chart" | "export" | "kpi" | "draft"

export interface KamiArtifactDTO {
  id: string
  session_id: string
  type: KamiArtifactType
  title: string | null
  schema_version: string
  payload: Record<string, unknown>
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface KamiReportTemplateDTO {
  id: string
  name: string
  title: string
  description: string | null
  prompt: string
  required_tools: string[] | null
  artifact_schema: Record<string, unknown> | null
  category: string
  disabled: boolean
  metadata: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
}

export interface FilterableKamiSkillProps {
  id?: string | string[]
  name?: string | string[]
  disabled?: boolean
  origin?: KamiSkillOrigin | KamiSkillOrigin[]
}

export interface FilterableKamiMemoryProps {
  id?: string | string[]
  user_id?: string | string[]
  session_id?: string | string[]
  type?: KamiMemoryType | KamiMemoryType[]
}

export interface FilterableKamiApprovalProps {
  id?: string | string[]
  session_id?: string | string[]
  status?: KamiApprovalStatus | KamiApprovalStatus[]
}

export interface FilterableKamiArtifactProps {
  id?: string | string[]
  session_id?: string | string[]
  type?: KamiArtifactType | KamiArtifactType[]
}

export interface FilterableKamiReportTemplateProps {
  id?: string | string[]
  name?: string | string[]
  disabled?: boolean
  category?: string | string[]
}
