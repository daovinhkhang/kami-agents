import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const approvals = await (resolveKami(req) as any).listKamiApprovals(
    {},
    listConfig(req)
  )

  res.json({ approvals })
}
