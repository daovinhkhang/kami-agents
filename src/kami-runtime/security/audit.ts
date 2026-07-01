import type { KamiCtx, KamiToolCall, KamiToolRisk } from "../types"

const summarize = (result: unknown) => {
  if (typeof result === "string") {
    return result.slice(0, 1000)
  }

  try {
    return JSON.stringify(result).slice(0, 1000)
  } catch {
    return "[unserializable result]"
  }
}

export const withAudit = async <T>(
  ctx: KamiCtx,
  call: KamiToolCall,
  risk: KamiToolRisk,
  fn: () => Promise<T>
) => {
  try {
    const result = await fn()

    await (ctx.kami as any).createKamiAuditLogs({
      session_id: ctx.sessionId,
      tool: call.name,
      args: call.arguments,
      result_summary: summarize(result),
      risk_level: risk,
      actor: "kami",
    })

    return result
  } catch (error) {
    await (ctx.kami as any).createKamiAuditLogs({
      session_id: ctx.sessionId,
      tool: call.name,
      args: call.arguments,
      result_summary: error instanceof Error ? error.message : String(error),
      risk_level: risk,
      actor: "kami",
      metadata: { error: true },
    })

    throw error
  }
}
