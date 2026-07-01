import { runTurn } from "../loop/run-turn"
import type {
  SubagentConfig,
  SubagentResult,
  SubagentContext,
} from "./types"

const TITLE_MAX = 80

/**
 * Spawn a subagent that runs an independent KAMI turn in a child session.
 *
 * The subagent:
 *  - Creates its own session (linked via parent_session_id to the caller).
 *  - Runs its own loop with a restricted toolset and optional cheaper model.
 *  - Reports structured results back to the parent turn.
 *
 * Subagent sessions are non-blocking to the parent — the parent receives the
 * result as a tool result just like any other tool call.
 */
export const spawnSubagent = async (
  config: SubagentConfig,
  ctx: SubagentContext
): Promise<SubagentResult> => {
  const events: any[] = []
  const toolCalls: string[] = []

  try {
    for await (const event of runTurn(
      {
        message: config.task,
        source: "api",
        toolset: config.toolset ?? "admin",
        model: config.model,
        sessionId: undefined, // create a new child session
        userId: ctx.userId,
      },
      {
        scope: ctx.scope,
        kami: ctx.kami,
      }
    )) {
      events.push(event)

      if (event.type === "tool_start") {
        toolCalls.push(event.call.name)
      }
    }
  } catch (error) {
    events.push({
      type: "error" as const,
      message:
        error instanceof Error ? error.message : String(error),
    })
  }

  const done = [...events]
    .reverse()
    .find((event: any) => event.type === "done")

  const errorEvent = [...events]
    .reverse()
    .find((event: any) => event.type === "error")

  const sessionEvent = events.find(
    (event: any) => event.type === "session"
  )

  return {
    text: done?.text ?? errorEvent?.message ?? "",
    sessionId: sessionEvent?.session_id ?? "",
    toolCalls,
    done: !errorEvent,
    error: errorEvent?.message,
    events,
  }
}
