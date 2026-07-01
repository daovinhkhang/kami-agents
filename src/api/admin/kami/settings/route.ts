import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getKamiConfig } from "@kami/config"

export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { apiKey, model, fallbackModel, baseUrl, ...config } = getKamiConfig()

  res.json({
    settings: {
      ...config,
      hasApiKey: Boolean(apiKey),
    },
  })
}
