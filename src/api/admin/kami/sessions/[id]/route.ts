import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const session = await (resolveKami(req) as any).retrieveKamiSession(
    req.params.id
  )

  res.json({ session })
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const current = await (resolveKami(req) as any).retrieveKamiSession(req.params.id)
  const title = typeof body.title === "string" ? body.title.trim() : undefined

  if (body.title !== undefined && !title) {
    res.status(400).json({
      type: "invalid_request",
      message: "Session title is required",
    })
    return
  }

  const metadata = {
    ...(current.metadata ?? {}),
    ...(body.metadata ?? {}),
  }

  if (typeof body.pinned === "boolean") {
    metadata.pinned = body.pinned
    metadata.pinned_at = body.pinned ? new Date().toISOString() : null
  }

  if (typeof body.archived === "boolean") {
    metadata.archived = body.archived
    metadata.archived_at = body.archived ? new Date().toISOString() : null
  }

  if (Array.isArray(body.tags)) {
    metadata.tags = body.tags
  }

  if (typeof body.category === "string") {
    metadata.category = body.category
  }

  const session = await (resolveKami(req) as any).updateKamiSessions({
    id: req.params.id,
    ...(title ? { title: title.slice(0, 120) } : {}),
    metadata,
  })

  res.json({ session })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await (resolveKami(req) as any).deleteKamiSessions(req.params.id)

  res.json({ id: req.params.id, object: "kami_session", deleted: true })
}
