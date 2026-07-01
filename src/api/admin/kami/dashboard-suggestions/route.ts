import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getKamiConfig } from "@kami/config"
import { buildDashboardSuggestions } from "@kami/report/dashboard-suggestions"
import { buildExecutionContext } from "@kami/security/execution-context"
import { resolveKami } from "../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kami = resolveKami(req)
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "dashboard"
  const suggestions = await buildDashboardSuggestions({
    scope: req.scope,
    kami,
    config: getKamiConfig(),
    sessionId,
    userId: req.auth_context?.actor_id,
    toolset: "admin",
    executor: buildExecutionContext({
      scope: req.scope,
      sessionId,
      userId: req.auth_context?.actor_id,
    }),
  })

  res.json({ suggestions })
}
