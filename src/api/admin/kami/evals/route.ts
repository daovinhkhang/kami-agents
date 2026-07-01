import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getKamiConfig } from "@kami/config"
import { runKamiEvaluationHarness } from "@kami/evals/harness"
import { ensureToolsRegistered } from "@kami/tools/toolsets"

const runEval = (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  ensureToolsRegistered()

  const config = getKamiConfig()
  if (!config.evalHarnessEnabled) {
    res.status(403).json({
      enabled: false,
      error: "Evaluation harness is disabled. Set KAMI_EVAL_HARNESS_ENABLED=true.",
    })
    return
  }

  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "eval"

  res.json({
    enabled: true,
    result: runKamiEvaluationHarness({
      config,
      sessionId,
    }),
  })
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => runEval(req, res)

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => runEval(req, res)
