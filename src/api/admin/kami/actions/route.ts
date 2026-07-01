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
import { resolveKami } from "../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  ensureToolsRegistered()

  const body = req.body as any
  const tool = String(body.tool ?? "")
  const entry = getTool(tool)

  if (!entry) {
    res.status(400).json({
      type: "invalid_request",
      message: `Unknown quick action tool: ${tool}`,
    })
    return
  }

  const kami = resolveKami(req) as any
  let sessionId = body.session_id as string | undefined

  if (!sessionId) {
    const [session] = await kami.createKamiSessions([
      {
        title: body.label ?? "KAMI action",
        source: "admin",
        user_id: req.auth_context?.actor_id ?? null,
        status: "active",
        message_count: 0,
        metadata: { category: "action", tags: ["action"] },
      },
    ])
    sessionId = session.id
  }

  const resolvedSessionId = sessionId as string

  const ctx = {
    scope: req.scope,
    kami,
    config: getKamiConfig(),
    sessionId: resolvedSessionId,
    userId: req.auth_context?.actor_id,
    toolset: "admin",
    executor: buildExecutionContext({
      scope: req.scope,
      sessionId: resolvedSessionId,
      userId: req.auth_context?.actor_id,
    }),
  }

  const dispatched = await dispatchTool(
    {
      id: `quick_action_${Date.now()}`,
      name: tool,
      arguments: body.args ?? {},
    },
    ctx
  )
  let artifact: any = null
  const toolResult = {
    call: {
      id: `quick_action_${Date.now()}`,
      name: tool,
      arguments: body.args ?? {},
    },
    result: dispatched.result,
  }

  if (
    !dispatched.approvalRequired &&
    REPORT_ARTIFACT_TOOLS.includes(tool)
  ) {
    const payload = buildReportArtifactPayload({
      title: body.label ?? "KAMI Action Report",
      userMessage: body.label ?? tool,
      results: [toolResult],
    })
    artifact = await createAndPersistArtifact(kami, resolvedSessionId, payload)
  }

  const quickActions = buildQuickActions({
    sessionId: resolvedSessionId,
    artifactId: artifact?.id,
    userMessage: body.label ?? tool,
    results: [toolResult],
  })

  res.json({
    session_id: resolvedSessionId,
    tool,
    risk: dispatched.risk,
    approval_required: dispatched.approvalRequired,
    approval: null,
    result: dispatched.result,
    artifact,
    quick_actions: quickActions,
  })
}
