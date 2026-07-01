import type { KamiCtx, KamiEvent } from "../types"

export type SubagentConfig = {
  /** Task description — becomes the first user message in the subagent session. */
  task: string
  /** Restrict tools the subagent can use (default: the calling session's toolset). */
  toolset?: string
  /** Optional model override for cheaper/faster subagent (e.g. "deepseek-chat"). */
  model?: string
  /** Max iterations for the subagent loop (default: 8). */
  maxIterations?: number
  /** Whether to stream subagent events back to the parent. */
  streamEvents?: boolean
}

export type SubagentResult = {
  /** Final text output from the subagent. */
  text: string
  /** Subagent session id (linked via parent_session_id). */
  sessionId: string
  /** Tools the subagent called, in order. */
  toolCalls: string[]
  /** Whether the subagent completed normally (vs budget/error). */
  done: boolean
  /** Error message if the subagent failed. */
  error?: string
  /** All raw events from the subagent loop. */
  events: KamiEvent[]
}

export type SubagentContext = Pick<
  KamiCtx,
  "scope" | "kami" | "userId" | "config"
>
