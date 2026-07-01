import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : undefined
  const status = typeof req.query.status === "string" ? req.query.status : undefined
  const filter: Record<string, unknown> = { type: "draft" }

  if (sessionId) {
    filter.session_id = sessionId
  }

  let drafts = await (resolveKami(req) as any).listKamiArtifacts(
    filter,
    listConfig(req)
  )

  if (status) {
    drafts = drafts.filter((draft: any) => draft.payload?.status === status)
  }

  res.json({ drafts })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any

  if (!body.session_id || !body.payload?.target_tool || !body.payload?.args) {
    res.status(400).json({
      type: "invalid_request",
      message: "session_id, payload.target_tool, and payload.args are required",
    })
    return
  }

  const now = new Date().toISOString()
  const payload = {
    version: "1.0",
    status: "pending",
    timezone: "Asia/Ho_Chi_Minh",
    utc_offset: "UTC+7",
    created_at: now,
    updated_at: now,
    ...body.payload,
  }

  const [draft] = await (resolveKami(req) as any).createKamiArtifacts([
    {
      session_id: body.session_id,
      type: "draft",
      title: body.title ?? payload.title ?? "KAMI Draft",
      schema_version: payload.version ?? "1.0",
      payload,
      metadata: {
        status: payload.status,
        draft_type: payload.draft_type ?? "custom",
        target_tool: payload.target_tool,
        risk: payload.risk ?? "mutating",
        confirm_required: payload.confirm_required ?? true,
        ...(body.metadata ?? {}),
      },
    },
  ])

  res.status(201).json({ draft })
}
