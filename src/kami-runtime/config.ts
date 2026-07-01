import type { KamiConfig } from "./types"

const bool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

const autonomyMode = (value: string | undefined): KamiConfig["autonomyMode"] => {
  if (value === "assist" || value === "copilot" || value === "autopilot") {
    return value
  }

  return "copilot"
}

export const getKamiConfig = (): KamiConfig => {
  const reasoningEffort = process.env.KAMI_REASONING_EFFORT ?? "high"
  const timezone = process.env.KAMI_TIMEZONE || process.env.TZ || "Asia/Ho_Chi_Minh"

  return {
    model: process.env.KAMI_MODEL || "deepseek-v4-pro",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
    reasoningEffort: ["low", "medium", "high"].includes(reasoningEffort)
      ? (reasoningEffort as KamiConfig["reasoningEffort"])
      : "high",
    thinking: bool(process.env.KAMI_THINKING, true),
    maxIterations: int(process.env.KAMI_MAX_ITERATIONS, 25),
    maxTokensPerTurn: int(process.env.KAMI_MAX_TOKENS_PER_TURN, 60000),
    contextLimit: int(process.env.KAMI_CONTEXT_LIMIT, 128000),
    approvalRequired: bool(process.env.KAMI_APPROVAL_REQUIRED, true),
    destructiveTools: (process.env.KAMI_DESTRUCTIVE_TOOLS || "")
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    halt: bool(process.env.KAMI_HALT, false),
    mockLlm: bool(process.env.KAMI_TEST_MOCK_LLM, false),
    fallbackModel:
      process.env.KAMI_FALLBACK_MODEL || "deepseek-chat",
    timezone,
    utcOffset: process.env.KAMI_UTC_OFFSET || "UTC+7",
    healthcheckEnabled: bool(
      process.env.KAMI_HEALTHCHECK_ENABLED,
      true
    ),
    maxRetries: int(process.env.KAMI_MAX_RETRIES, 3),
    retryDelayMs: int(process.env.KAMI_RETRY_DELAY_MS, 1000),
    sandboxEnabled: bool(process.env.KAMI_SANDBOX_ENABLED, false),
    sandboxImage: process.env.KAMI_SANDBOX_IMAGE || "alpine:3.20",
    sandboxTimeoutMs: int(process.env.KAMI_SANDBOX_TIMEOUT_MS, 30_000),
    sandboxMemoryMb: int(process.env.KAMI_SANDBOX_MEMORY_MB, 128),
    autonomyMode: autonomyMode(process.env.KAMI_AUTONOMY_MODE),
    autonomyMaxMutationsPerTurn: int(process.env.KAMI_AUTONOMY_MAX_MUTATIONS_PER_TURN, 4),
    autonomyAllowDestructive: bool(process.env.KAMI_AUTONOMY_ALLOW_DESTRUCTIVE, false),
    evalHarnessEnabled: bool(process.env.KAMI_EVAL_HARNESS_ENABLED, true),
  }
}
