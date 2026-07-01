import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { resolveKami, listConfig } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const logs = await (resolveKami(req) as any).listKamiAuditLogs(
    {},
    listConfig(req)
  )

  res.json({ audit_logs: logs })
}
