import { runTurn } from "../kami-runtime"

export default async function kamiSmoke({ container }: any) {
  process.env.KAMI_TEST_MOCK_LLM = "true"

  const kami = container.resolve("kami")
  const events: any[] = []

  for await (const event of runTurn(
    {
      message: "Smoke test. Reply with OK.",
      source: "api",
      toolset: "admin",
    },
    {
      scope: container,
      kami,
    }
  )) {
    events.push(event)
  }

  const sessionId = events.find((event) => event.type === "session")?.session_id
  const done = events.find((event) => event.type === "done")

  if (!sessionId) {
    throw new Error("KAMI smoke failed: no session event")
  }

  if (!done) {
    throw new Error("KAMI smoke failed: no done event")
  }

  const messages = await kami.listKamiMessages(
    { session_id: sessionId },
    { take: 20, order: { created_at: "ASC" } }
  )
  const skills = await kami.listKamiSkills(
    { disabled: false },
    { take: 20, order: { name: "ASC" } }
  )

  if (messages.length < 2) {
    throw new Error("KAMI smoke failed: expected persisted user+assistant messages")
  }

  if (skills.length < 4) {
    throw new Error("KAMI smoke failed: expected default seed skills")
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        session_id: sessionId,
        event_types: events.map((event) => event.type),
        message_count: messages.length,
        seeded_skills: skills.map((skill: any) => skill.name),
      },
      null,
      2
    )
  )
}

