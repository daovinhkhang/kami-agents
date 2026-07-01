import type { KamiCtx, KamiToolCall } from "../types"

export const requestApproval = async (ctx: KamiCtx, call: KamiToolCall) => {
  const [approval] = await (ctx.kami as any).createKamiApprovals([
    {
      session_id: ctx.sessionId,
      tool: call.name,
      args: call.arguments,
      status: "pending",
      requested_at: new Date(),
    },
  ])

  return approval
}
