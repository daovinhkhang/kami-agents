import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req) as any
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : undefined
  const filter = sessionId ? { session_id: sessionId } : {}
  const artifacts = await kami.listKamiArtifacts(filter, listConfig(req))
  const reports = artifacts.filter((artifact: any) => artifact.type !== "draft")

  res.json({ reports })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any

  if (!body.session_id || !body.payload) {
    res.status(400).json({
      type: "invalid_request",
      message: "session_id and payload are required",
    })
    return
  }

  const [report] = await (resolveKami(req) as any).createKamiArtifacts([
    {
      session_id: body.session_id,
      type: body.type ?? "report",
      title: body.title ?? body.payload?.title ?? "KAMI Report",
      schema_version: body.schema_version ?? body.payload?.version ?? "1.0",
      payload: body.payload,
      metadata: body.metadata ?? null,
    },
  ])

  res.status(201).json({ report })
}
