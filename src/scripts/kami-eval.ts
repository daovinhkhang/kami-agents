import { getKamiConfig } from "../kami-runtime/config"
import { runKamiEvaluationHarness } from "../kami-runtime/evals/harness"
import { ensureToolsRegistered } from "../kami-runtime/tools/toolsets"

export default async function kamiEval() {
  ensureToolsRegistered()

  const result = runKamiEvaluationHarness({
    config: getKamiConfig(),
    sessionId: "script-eval",
  })

  if (result.totals.failed > 0) {
    console.log(JSON.stringify(result, null, 2))
    throw new Error(`KAMI eval failed: ${result.totals.failed} checks failed`)
  }

  console.log(JSON.stringify(result, null, 2))
}
