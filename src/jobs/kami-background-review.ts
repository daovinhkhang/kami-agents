import type { ScheduledJobHandler } from "@medusajs/framework/jobs"
import { pruneSkills, scoreSkills } from "../kami-runtime/skills/improve"
import { getKamiConfig } from "../kami-runtime/config"

/**
 * Background skill maintenance job — runs every 6 hours.
 *
 * Phase 3 skill self-improvement:
 * 1. Score unrated agent-origin skills for quality.
 * 2. Prune duplicate / low-quality / stale skills.
 *
 * This is a maintenance job, not a real-time concern. The turn-end
 * consolidation (runTurn finally block) handles immediate learnings;
 * this job catches up on quality scoring and pruning that don't need
 * to happen inline.
 */
const handler: ScheduledJobHandler = async (container) => {
  const config = getKamiConfig()

  if (config.halt || config.mockLlm) {
    return { skipped: true, reason: config.halt ? "halted" : "mock_llm" }
  }

  const kami = container.resolve("kami") as any
  const now = new Date()

  const pruned = await pruneSkills(kami)
  const scored = await scoreSkills(kami)

  await (kami as any).createKamiAuditLogs([
    {
      session_id: null,
      tool: "kami-background-review",
      args: { job: "background-review" },
      result_summary: JSON.stringify({
        pruned: pruned.pruned,
        kept: pruned.kept,
        scored,
      }).slice(0, 1000),
      risk_level: "safe",
      actor: "kami",
    },
  ])

  return {
    pruned: pruned.pruned.length,
    kept: pruned.kept,
    scored,
    at: now.toISOString(),
  }
}

export default handler

export const config = {
  name: "kami-background-review",
  schedule: "0 */6 * * *", // every 6 hours
}
