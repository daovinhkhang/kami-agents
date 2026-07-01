import type KamiModuleService from "../../modules/kami/services/kami-module-service"
import { completeWithDeepSeek } from "../provider/deepseek"
import { getKamiConfig } from "../config"
import type { KamiChatMessage } from "../types"

type ConsolidationInput = {
  sessionId: string
  messages: { role: string; content: string }[]
}

type ConsolidationOutput = {
  skills: {
    name: string
    description: string
    category: string
    content: string
  }[]
}

const CONSOLIDATION_SYSTEM = [
  "You are KAMI's skill manager. Review the conversation below and extract reusable learnings as skills.",
  "",
  "Rules:",
  "1. Only create a skill if the conversation contains a concrete, reusable procedure or insight.",
  "2. Each skill must have: name (kebab-case, max 50 chars), description (one line), category (one of: commerce, inventory, catalog, analytics, customer, order, general), content (markdown procedure with steps).",
  "3. Do NOT create a skill for trivial one-off lookups or greetings.",
  "4. If the conversation did not produce anything worth capturing, return an empty skills array.",
  "5. Name must be unique across the session — if a skill with the same name already exists, update it instead.",
  "6. Content should follow the KAMI skill format: # name, then numbered procedure steps.",
  "",
  "Return JSON: { \"skills\": [{ \"name\":\"...\", \"description\":\"...\", \"category\":\"...\", \"content\":\"...\" }] }",
].join("\n")

/**
 * Run turn-end skill consolidation. Scans the completed session for new
 * knowledge and creates/updates skills. Fire-and-forget — never throws.
 */
export const consolidateFromSession = async (
  sessionId: string,
  kami: KamiModuleService
): Promise<void> => {
  const config = getKamiConfig()

  if (config.mockLlm) {
    return
  }

  try {
    const messages = await (kami as any).listKamiMessages(
      { session_id: sessionId },
      { take: 50, order: { created_at: "ASC" } }
    )

    if (messages.length < 3) {
      return
    }

    const conversation = messages
      .map(
        (msg: any) =>
          `${msg.role}: ${(msg.content ?? "").slice(0, 2000)}`
      )
      .join("\n\n")

    const prompt = [
      CONSOLIDATION_SYSTEM,
      "",
      "--- Session conversation ---",
      conversation,
      "--- End ---",
      "",
      "Extract learnings as JSON:",
    ].join("\n")

    const completion = await completeWithDeepSeek({
      config: {
        ...config,
        model: config.fallbackModel, // use cheap model
        thinking: false,
        maxIterations: 1,
      },
      messages: [
        { role: "user", content: prompt } as KamiChatMessage,
      ],
      tools: [],
    })

    let response = completion.text.trim()

    // Extract JSON from possible markdown code fence.
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)

    if (jsonMatch) {
      response = jsonMatch[1].trim()
    }

    const parsed: ConsolidationOutput = JSON.parse(response)

    if (!parsed.skills?.length) {
      return
    }

    for (const skill of parsed.skills) {
      if (!skill.name || !skill.content) {
        continue
      }

      const existing = await (kami as any).listKamiSkills({
        name: skill.name,
      })

      if (existing[0]) {
        await (kami as any).updateKamiSkills({
          id: existing[0].id,
          description:
            skill.description ?? existing[0].description,
          content: skill.content,
          category: skill.category ?? existing[0].category,
          version: String(
            Number(existing[0].version ?? "0.1.0") + 0.1
          ),
          origin: "agent",
          metadata: {
            ...(existing[0].metadata ?? {}),
            consolidated_at: new Date().toISOString(),
            consolidated_from: sessionId,
            quality_score:
              (existing[0].metadata?.quality_score ?? 0.5) + 0.1,
          },
        })
      } else {
        await (kami as any).createKamiSkills([
          {
            name: skill.name,
            description: skill.description ?? null,
            category: skill.category ?? "general",
            version: "0.1.0",
            content: skill.content,
            origin: "agent",
            disabled: false,
            frontmatter: {
              name: skill.name,
              description: skill.description,
              version: "0.1.0",
              platforms: ["medusa"],
            },
            platforms: ["medusa"],
            metadata: {
              consolidated_at: new Date().toISOString(),
              consolidated_from: sessionId,
              quality_score: 0.5,
            },
          },
        ])
      }
    }
  } catch {
    // Fire-and-forget — consolidation failures are never surfaced to the
    // user. The background review job will catch up later.
  }
}

const PRUNE_SYSTEM = [
  "You are KAMI's skill quality reviewer. Evaluate the skills below and flag any that should be pruned.",
  "",
  "Prune criteria:",
  "1. Duplicate: another skill with the same name or near-identical content exists.",
  "2. Stale: no longer relevant (e.g. references removed features).",
  "3. Low-quality: content is too vague, trivial, or incomplete.",
  "4. Redundant: the general system prompt or commerce tools already cover it.",
  "",
  "Return JSON: { \"prune\": [\"skill-name-1\", ...], \"reasons\": { \"skill-name\": \"reason\" } }",
  "Return empty prune array if all skills are good.",
].join("\n")

/**
 * Review all agent-origin skills and prune low-quality / duplicate ones.
 * Runs periodically via the background review scheduled job.
 */
export const pruneSkills = async (
  kami: KamiModuleService
): Promise<{ pruned: string[]; kept: number }> => {
  const config = getKamiConfig()

  if (config.mockLlm) {
    return { pruned: [], kept: 0 }
  }

  const allSkills = await (kami as any).listKamiSkills(
    { origin: "agent", disabled: false },
    { take: 100, order: { name: "ASC" } }
  )

  if (allSkills.length < 5) {
    return { pruned: [], kept: allSkills.length }
  }

  const skillList = allSkills
    .map(
      (skill: any) =>
        `- ${skill.name} (v${skill.version}, category: ${skill.category ?? "-"}): ${(skill.description ?? "").slice(0, 200)}`
    )
    .join("\n")

  try {
    const completion = await completeWithDeepSeek({
      config: {
        ...config,
        model: config.fallbackModel,
        thinking: false,
        maxIterations: 1,
      },
      messages: [
        {
          role: "user",
          content: [
            PRUNE_SYSTEM,
            "",
            "--- Skills to review ---",
            skillList,
            "--- End ---",
            "",
            "Evaluate:",
          ].join("\n"),
        } as KamiChatMessage,
      ],
      tools: [],
    })

    let response = completion.text.trim()
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)

    if (jsonMatch) {
      response = jsonMatch[1].trim()
    }

    const { prune = [] } = JSON.parse(response)

    for (const name of prune) {
      const match = allSkills.find(
        (skill: any) => skill.name === name
      )

      if (match) {
        await (kami as any).updateKamiSkills({
          id: match.id,
          disabled: true,
          metadata: {
            ...(match.metadata ?? {}),
            pruned_at: new Date().toISOString(),
            pruned_reason: "low quality / duplicate",
          },
        })
      }
    }

    return { pruned: prune, kept: allSkills.length - prune.length }
  } catch {
    return { pruned: [], kept: allSkills.length }
  }
}

/**
 * Score agent-origin skills on quality using a cheap LLM call.
 * Updates skill metadata.quality_score for display in the admin UI.
 */
export const scoreSkills = async (
  kami: KamiModuleService
): Promise<number> => {
  const config = getKamiConfig()

  if (config.mockLlm) {
    return 0
  }

  const skills = await (kami as any).listKamiSkills(
    { origin: "agent", disabled: false },
    { take: 20, order: { name: "ASC" } }
  )

  let scored = 0

  for (const skill of skills) {
    const qualityScore = skill.metadata?.quality_score as number | undefined

    // Only rescore skills without a score or older than 7 days.
    if (qualityScore !== undefined && qualityScore > 0) {
      continue
    }

    try {
      const completion = await completeWithDeepSeek({
        config: {
          ...config,
          model: config.fallbackModel,
          thinking: false,
          maxIterations: 1,
        },
        messages: [
          {
            role: "user",
            content: [
              "Score this skill on quality (0.0 to 1.0). Consider: clarity, reusability, completeness, correctness. Return ONLY the number.",
              "",
              `Name: ${skill.name}`,
              `Description: ${skill.description ?? "none"}`,
              `Content: ${(skill.content ?? "").slice(0, 1000)}`,
            ].join("\n"),
          } as KamiChatMessage,
        ],
        tools: [],
      })

      const score = parseFloat(completion.text.trim())

      if (Number.isFinite(score) && score >= 0 && score <= 1) {
        await (kami as any).updateKamiSkills({
          id: skill.id,
          metadata: {
            ...(skill.metadata ?? {}),
            quality_score: score,
            scored_at: new Date().toISOString(),
          },
        })
        scored++
      }
    } catch {
      // Individual skill scoring failure is non-fatal.
    }
  }

  return scored
}
