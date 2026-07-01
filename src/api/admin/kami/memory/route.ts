import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  let memories = await (resolveKami(req) as any).listKamiMemories(
    {},
    listConfig(req)
  )
  const category = typeof req.query.category === "string" ? req.query.category : ""
  const includeDisabled = req.query.include_disabled === "true"

  memories = memories.filter((memory: any) => {
    const metadata = memory.metadata ?? {}

    if (!includeDisabled && metadata.disabled) return false
    if (category && metadata.category !== category) return false

    return true
  })

  res.json({ memories })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const [memory] = await (resolveKami(req) as any).createKamiMemories([
    {
      user_id: body.user_id ?? req.auth_context?.actor_id ?? null,
      session_id: body.session_id ?? null,
      type: body.type ?? "factual",
      content: body.content,
      importance: body.importance ?? 1,
      metadata: {
        category: body.category ?? body.metadata?.category ?? body.type ?? "factual",
        disabled: Boolean(body.disabled ?? body.metadata?.disabled ?? false),
        created_by: "human",
        ...(body.metadata ?? {}),
      },
    },
  ])

  res.status(201).json({ memory })
}
