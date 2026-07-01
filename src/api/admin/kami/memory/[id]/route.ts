import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const current = await (resolveKami(req) as any).retrieveKamiMemory(req.params.id)
  const metadata = {
    ...(current.metadata ?? {}),
    ...(body.metadata ?? {}),
    ...(body.category ? { category: body.category } : {}),
    ...(typeof body.disabled === "boolean" ? { disabled: body.disabled } : {}),
    edited_at: new Date().toISOString(),
  }

  const memory = await (resolveKami(req) as any).updateKamiMemories({
    id: req.params.id,
    ...(body.type ? { type: body.type } : {}),
    ...(body.content !== undefined ? { content: body.content } : {}),
    ...(body.importance !== undefined ? { importance: body.importance } : {}),
    metadata,
  })

  res.json({ memory })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await (resolveKami(req) as any).deleteKamiMemories(req.params.id)

  res.json({ id: req.params.id, object: "kami_memory", deleted: true })
}
