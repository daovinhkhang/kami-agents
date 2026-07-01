import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { runHealthcheck, getHealthStatus } from "@kami/provider/healthcheck"
import { getKamiConfig } from "@kami/config"

export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const config = getKamiConfig()
  const { lastCheck, consecutiveFailures } = getHealthStatus()

  // Run a probe on every GET (cheap 1-token call) so the admin UI always
  // reflects live state.
  let probe = lastCheck

  if (config.healthcheckEnabled) {
    probe = await runHealthcheck()
  }

  res.json({
    health: {
      healthy: probe?.healthy ?? true,
      last_check: probe,
      consecutive_failures: consecutiveFailures,
      healthcheck_enabled: config.healthcheckEnabled,
    },
  })
}
