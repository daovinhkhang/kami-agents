import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami } from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const query = String(body.query ?? "").toLowerCase()
  const limit = Math.min(Number(body.limit ?? 20), 100)
  const memories = await (resolveKami(req) as any).listKamiMemories(
    {},
    { take: 500, order: { created_at: "DESC" } }
  )

  res.json({
    memories: memories
      .filter((memory: any) =>
        String(memory.content ?? "").toLowerCase().includes(query)
      )
      .slice(0, limit),
  })
}
