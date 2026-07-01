import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

const mergeDraftPayload = (current: any, patch: any) => {
  const now = new Date().toISOString()

  return {
    ...(current ?? {}),
    ...(patch.payload ?? {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.args !== undefined ? { args: patch.args } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updated_at: now,
  }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await (resolveKami(req) as any).retrieveKamiArtifact(req.params.id)

  res.json({ draft })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req) as any
  const body = req.body as any
  const current = await kami.retrieveKamiArtifact(req.params.id)
  const payload = mergeDraftPayload(current.payload, body)

  const draft = await kami.updateKamiArtifacts({
    id: req.params.id,
    title: body.title ?? current.title,
    payload,
    metadata: {
      ...(current.metadata ?? {}),
      status: payload.status,
      draft_type: payload.draft_type,
      target_tool: payload.target_tool,
      risk: payload.risk,
      confirm_required: payload.confirm_required,
      ...(body.metadata ?? {}),
    },
  })

  res.json({ draft })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req) as any
  const current = await kami.retrieveKamiArtifact(req.params.id)
  const now = new Date().toISOString()
  const payload = {
    ...(current.payload ?? {}),
    status: "dismissed",
    updated_at: now,
  }

  const draft = await kami.updateKamiArtifacts({
    id: req.params.id,
    payload,
    metadata: {
      ...(current.metadata ?? {}),
      status: "dismissed",
      dismissed_at: now,
    },
  })

  res.json({ draft })
}
