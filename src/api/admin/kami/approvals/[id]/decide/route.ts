import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getApprovalGate } from "@kami/security/approval-gate-v2"
import { resolveKami } from "../../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const kami = resolveKami(req) as any
  const current = await kami.retrieveKamiApproval(req.params.id)
  const status = body.status === "approved" ? "approved" : "rejected"
  const scope = (body.scope as string) || "once"

  if (current.status !== "pending") {
    res.json({ approval: current })
    return
  }

  // Resolve the blocking Promise in ApprovalGate — the turn will continue
  // automatically. We do NOT call executeApprovedTool here anymore.
  const gate = getApprovalGate()
  const resolved = gate.resolve(req.params.id, {
    approved: status === "approved",
    scope: scope as "once" | "session" | "always",
    decidedAt: new Date(),
    decidedBy: req.auth_context?.actor_id ?? undefined,
    reason: status === "rejected"
      ? (body.reason ?? "Rejected by user")
      : "Approved by user",
  })

  // Update DB record
  const approval = await kami.updateKamiApprovals({
    id: req.params.id,
    status,
    decided_by: req.auth_context?.actor_id ?? null,
    decided_at: new Date(),
    reason: body.reason ?? null,
    scope,
  })

  res.json({
    approval,
    resolved: resolved,
    message: resolved
      ? "Approval decision applied — the turn will continue automatically."
      : "Approval request was not found in the active gate (may have timed out).",
  })
}
