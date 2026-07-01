// Phase 0 — DeepSeek connectivity test.
// Zero-dependency (uses Node 20+ global fetch). Loads env via `node --env-file=.env`.
// Validates: auth, model name, reasoning_effort, and thinking (extra_body).
//
//   node --env-file=.env scripts/test-deepseek.mjs
//   # or:  yarn test:deepseek

const apiKey = process.env.DEEPSEEK_API_KEY
const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "")
const model = process.env.KAMI_MODEL || "deepseek-v4-pro"
const reasoningEffort = process.env.KAMI_REASONING_EFFORT || "high"
const thinking = String(process.env.KAMI_THINKING || "true") === "true"
const prompt = process.argv[2] || "Say hi in one sentence and confirm you can reason."

if (!apiKey) {
  console.error("DEEPSEEK_API_KEY is missing. Put it in .env first.")
  process.exit(1)
}

console.log("KAMI / DeepSeek connectivity test")
console.log("  base_url        :", baseUrl)
console.log("  model           :", model)
console.log("  reasoning_effort:", reasoningEffort)
console.log("  thinking        :", thinking)
console.log("")

const body = {
  model,
  stream: false,
  messages: [
    {
      role: "system",
      content:
        "You are KAMI, an AI agent embedded in a commerce platform. Be concise.",
    },
    { role: "user", content: prompt },
  ],
  reasoning_effort: reasoningEffort,
}
if (thinking) {
  // Matches the OpenAI SDK `extra_body` the user provided.
  body.thinking = { type: "enabled" }
}

const start = Date.now()
let res
try {
  res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
} catch (err) {
  console.error("NETWORK ERROR — cannot reach DeepSeek:", err?.message || err)
  process.exit(2)
}

const elapsed = Date.now() - start
const text = await res.text()

if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText} (after ${elapsed}ms)`)
  console.error(text)
  process.exit(3)
}

let json
try {
  json = JSON.parse(text)
} catch {
  console.error("Could not parse JSON response:\n", text)
  process.exit(4)
}

const choice = json.choices?.[0]
const msg = choice?.message ?? {}

console.log(`OK — HTTP 200 (${elapsed}ms)`)
console.log("  model echoed    :", json.model)
console.log("  finish_reason   :", choice?.finish_reason)
console.log("  usage           :", JSON.stringify(json.usage ?? {}))
if (msg.reasoning_content) {
  console.log("")
  console.log("--- reasoning_content ---")
  console.log(
    typeof msg.reasoning_content === "string"
      ? msg.reasoning_content
      : JSON.stringify(msg.reasoning_content, null, 2)
  )
}
console.log("")
console.log("--- content ---")
console.log(msg.content ?? "(empty)")
console.log("")
console.log("KAMI↔DeepSeek link: working.")
