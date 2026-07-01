import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getKamiConfig } from "@kami/config"
import {
  buildReportArtifactPayload,
  createAndPersistArtifact,
  REPORT_ARTIFACT_TOOLS,
} from "@kami/report/artifact-builder"
import { buildQuickActions } from "@kami/report/quick-actions"
import { buildExecutionContext } from "@kami/security/execution-context"
import { dispatchTool } from "@kami/tools/dispatcher"
import { getTool } from "@kami/tools/registry"
import { ensureToolsRegistered } from "@kami/tools/toolsets"
import { resolveKami } from "../../../utils"

const reportTools = new Set(REPORT_ARTIFACT_TOOLS)

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  ensureToolsRegistered()

  const kami = resolveKami(req) as any
  const body = req.body as any
  const draftArtifact = await kami.retrieveKamiArtifact(req.params.id)
  const draft = draftArtifact.payload ?? {}
  const targetTool = String(body.tool ?? draft.target_tool ?? "")
  const args = body.args ?? draft.args ?? {}
  const entry = getTool(targetTool)

  if (draftArtifact.type !== "draft") {
    res.status(400).json({
      type: "invalid_request",
      message: "Artifact is not a commerce draft",
    })
    return
  }

  if (!entry) {
    res.status(400).json({
      type: "invalid_request",
      message: `Unknown draft target tool: ${targetTool}`,
    })
    return
  }

  const ctx = {
    scope: req.scope,
    kami,
    config: getKamiConfig(),
    sessionId: draftArtifact.session_id,
    userId: req.auth_context?.actor_id,
    toolset: "admin",
    executor: buildExecutionContext({
      scope: req.scope,
      sessionId: draftArtifact.session_id,
      userId: req.auth_context?.actor_id,
    }),
  }
  const call = {
    id: `draft_${Date.now()}`,
    name: targetTool,
    arguments: args,
  }
  const dispatched = await dispatchTool(call, ctx)
  // A validation rejection returns a diagnostic result ({ error: true, ... })
  // instead of executing — surface it as draft status "error" rather than "executed".
  const isDiagnosticError =
    !dispatched.approvalRequired &&
    dispatched.result != null &&
    typeof dispatched.result === "object" &&
    (dispatched.result as { error?: unknown }).error === true
  const status = dispatched.approvalRequired
    ? "approval_required"
    : isDiagnosticError
      ? "error"
      : "executed"
  const now = new Date().toISOString()
  const nextPayload = {
    ...draft,
    args,
    status,
    updated_at: now,
    ...(dispatched.approvalRequired ? {} : { executed_at: now }),
    execution_result: dispatched.result,
  }

  const updatedDraft = await kami.updateKamiArtifacts({
    id: draftArtifact.id,
    payload: nextPayload,
    metadata: {
      ...(draftArtifact.metadata ?? {}),
      status,
      executed_at: dispatched.approvalRequired ? null : now,
      approval_id: null,
      target_tool: targetTool,
      risk: dispatched.risk,
    },
  })

  let artifact: any = null
  const toolResult = { call, result: dispatched.result }

  if (!dispatched.approvalRequired && reportTools.has(targetTool)) {
    const payload = buildReportArtifactPayload({
      title: draft.title ?? "KAMI Draft Report",
      userMessage: draft.title ?? targetTool,
      results: [toolResult],
    })
    artifact = await createAndPersistArtifact(kami, draftArtifact.session_id, payload)
  }

  const quickActions = buildQuickActions({
    sessionId: draftArtifact.session_id,
    artifactId: artifact?.id,
    userMessage: draft.title ?? targetTool,
    results: [toolResult],
  })

  res.json({
    draft: updatedDraft,
    tool: targetTool,
    risk: dispatched.risk,
    approval_required: dispatched.approvalRequired,
    approval: null,
    result: dispatched.result,
    artifact,
    quick_actions: quickActions,
  })
}
