import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getKamiConfig } from "@kami/config"
import { buildAutonomySnapshot } from "@kami/security/autonomy"

export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const config = getKamiConfig()

  res.json({
    autonomy: buildAutonomySnapshot(config),
  })
}
