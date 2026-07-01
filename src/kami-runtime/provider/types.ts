import type { KamiChatMessage, KamiConfig, KamiToolCall } from "../types"
import type { ToolDefinition } from "../tools/registry"

export type ProviderInput = {
  config: KamiConfig
  messages: KamiChatMessage[]
  tools: ToolDefinition[]
  /** Override the model from config (used for fallback after failures). */
  modelOverride?: string
}

export type ProviderOutput = {
  text: string
  reasoning?: string
  toolCalls: KamiToolCall[]
  usage?: Record<string, unknown>
}
