import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ActiveLoops } from "@kami/index"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const body = req.body as any
  const halted = ActiveLoops.halt(body?.session_id)

  res.json({
    halted,
    active: ActiveLoops.list(),
  })
}
