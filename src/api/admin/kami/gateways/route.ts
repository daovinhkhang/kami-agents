import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { initGateways, listGateways } from "@kami/gateways"

export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  initGateways()
  const gateways = listGateways()

  const connections = gateways.map((gw) => ({
    id: gw.id,
    label: gw.label,
    enabled: gw.enabled,
    configured: true,
    webhook_path: `/admin/kami/gateways/${gw.id}`,
  }))

  res.json({ gateways: connections })
}
