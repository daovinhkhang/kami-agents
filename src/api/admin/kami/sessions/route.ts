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
  const limit = Math.min(Number(req.query.limit ?? 50), 500)
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : ""
  const tag = typeof req.query.tag === "string" ? req.query.tag : ""
  const category = typeof req.query.category === "string" ? req.query.category : ""
  const pinned = req.query.pinned === "true" ? true : req.query.pinned === "false" ? false : null
  const archived =
    req.query.archived === "all"
      ? null
      : req.query.archived === "true"
        ? true
        : req.query.archived === "false"
          ? false
          : false
  let sessions = await kami.listKamiSessions(
    {},
    { take: limit, order: { created_at: "DESC" } }
  )

  if (q) {
    const messages = await kami.listKamiMessages(
      {},
      { take: 500, order: { created_at: "DESC" } }
    )
    const matchingSessionIds = new Set(
      messages
        .filter((message: any) => String(message.content ?? "").toLowerCase().includes(q))
        .map((message: any) => message.session_id)
    )

    sessions = sessions.filter((session: any) =>
      String(session.title ?? "").toLowerCase().includes(q) ||
      matchingSessionIds.has(session.id)
    )
  }

  sessions = sessions.filter((session: any) => {
    const metadata = session.metadata ?? {}
    const tags = Array.isArray(metadata.tags) ? metadata.tags : []

    if (tag && !tags.includes(tag)) return false
    if (category && metadata.category !== category) return false
    if (pinned !== null && Boolean(metadata.pinned) !== pinned) return false
    if (archived !== null && Boolean(metadata.archived) !== archived) return false

    return true
  })

  sessions.sort((a: any, b: any) => {
    const ap = a.metadata?.pinned ? 1 : 0
    const bp = b.metadata?.pinned ? 1 : 0

    if (ap !== bp) return bp - ap

    return new Date(b.updated_at ?? b.created_at).getTime() -
      new Date(a.updated_at ?? a.created_at).getTime()
  })

  res.json({ sessions })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req) as any
  const [session] = await kami.createKamiSessions([
    {
      title: (req.body as any)?.title ?? "KAMI session",
      source: (req.body as any)?.source ?? "admin",
      user_id: req.auth_context?.actor_id ?? null,
      status: "active",
      message_count: 0,
      metadata: {
        category: (req.body as any)?.category ?? "chat",
        tags: (req.body as any)?.tags ?? [],
        ...((req.body as any)?.metadata ?? {}),
      },
    },
  ])

  res.status(201).json({ session })
}
