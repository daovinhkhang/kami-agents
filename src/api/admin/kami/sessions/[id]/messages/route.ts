import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const messages = await (resolveKami(req) as any).listKamiMessages(
    { session_id: req.params.id },
    {
      ...listConfig(req),
      order: { created_at: "ASC" },
    }
  )

  res.json({ messages })
}
