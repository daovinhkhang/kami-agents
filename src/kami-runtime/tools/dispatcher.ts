import { getApprovalGate } from "../security/approval-gate-v2"
import { evaluateAutonomy } from "../security/autonomy"
import { withAudit } from "../security/audit"
import type { KamiCtx, KamiToolCall, KamiToolRisk } from "../types"
import { getTool } from "./registry"
import { validateToolArgs } from "./arg-validator"

/** Canonical key for a tool call's arguments, immune to key-order differences. */
export const stableArgsKey = (args: unknown): string => {
  if (args && typeof args === "object") {
    return JSON.stringify(args, Object.keys(args as object).sort())
  }
  return JSON.stringify(args ?? null)
}

/**
 * The effective risk of a call. For most tools this is the statically
 * registered `entry.risk`, but `call_api` is a generic dispatcher whose real
 * risk depends on the HTTP method it was handed (GET reads, POST mutates,
 * DELETE destroys). run-turn also imports this so the tool_start badge and the
 * per-turn mutation limit reason about the SAME risk the approval gate does —
 * otherwise a `call_api` DELETE would render as "read" and slip past the
 * mutation counter.
 */
export const resolveEffectiveRisk = (
  entry: NonNullable<ReturnType<typeof getTool>>,
  args: Record<string, unknown>
): KamiToolRisk => {
  if (entry.name !== "call_api") {
    return entry.risk
  }

  const method = String(args.method ?? "GET").toUpperCase()
  if (method === "GET") {
    return "read"
  }
  if (method === "DELETE") {
    return "destructive"
  }
  return "mutating"
}

/**
 * Check if a tool call needs approval WITHOUT blocking.
 * Returns the approval request if needed (caller yields event, then blocks).
 */
export const checkApproval = async (
  call: KamiToolCall,
  ctx: KamiCtx
): Promise<{
  needsApproval: boolean
  alreadyApproved: boolean
  request?: import("../security/approval-gate-v2").ApprovalRequest
  risk: string
}> => {
  const entry = getTool(call.name)
  if (!entry) {
    return { needsApproval: false, alreadyApproved: false, risk: "read" }
  }

  const effectiveRisk = resolveEffectiveRisk(entry, call.arguments)
  const forcedDestructiveApproval =
    effectiveRisk === "destructive" &&
    (ctx.config.approvalRequired ||
      ctx.config.destructiveTools.includes(entry.name))
  const autonomy = evaluateAutonomy({ name: entry.name, risk: effectiveRisk }, ctx.config, {
    skipApproval: false,
    forcedDestructiveApproval,
  })

  if (!autonomy.approval_required) {
    return { needsApproval: false, alreadyApproved: false, risk: effectiveRisk }
  }

  const gate = getApprovalGate()
  const result = await gate.createRequest(ctx, call, effectiveRisk)

  return {
    needsApproval: true,
    alreadyApproved: result.alreadyApproved,
    request: result.alreadyApproved ? undefined : result.request,
    risk: effectiveRisk,
  }
}

/**
 * Block until the user decides on an approval request.
 * Returns the decision.
 */
export const waitForApproval = async (
  request: import("../security/approval-gate-v2").ApprovalRequest,
  ctx: KamiCtx,
  call: KamiToolCall
) => {
  const gate = getApprovalGate()
  return gate.waitForDecision(request, ctx, call)
}

const executeTool = async (
  call: KamiToolCall,
  ctx: KamiCtx,
  options: {
    skipApproval?: boolean
  } = {}
) => {
  const entry = getTool(call.name)

  if (!entry) {
    throw new Error(`Unknown KAMI tool: ${call.name}`)
  }

  const effectiveRisk = resolveEffectiveRisk(entry, call.arguments)

  // Pre-execution argument validation
  const argError = validateToolArgs(call.arguments, entry)
  if (argError) {
    return {
      approvalRequired: false,
      result: argError,
      risk: effectiveRisk,
    }
  }

  const result = await withAudit(ctx, call, effectiveRisk, () =>
    entry.handler(call.arguments, ctx)
  )

  return {
    approvalRequired: false,
    result,
    risk: effectiveRisk,
  }
}

export const dispatchTool = async (call: KamiToolCall, ctx: KamiCtx) => {
  return await executeTool(call, ctx)
}

export const executeApprovedTool = async (
  call: KamiToolCall,
  ctx: KamiCtx
) => {
  return await executeTool(call, ctx, { skipApproval: true })
}
