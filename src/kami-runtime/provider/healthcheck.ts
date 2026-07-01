import { completeWithDeepSeek } from "./deepseek"
import { getKamiConfig } from "../config"
import type { KamiChatMessage } from "../types"

export type HealthcheckResult = {
  healthy: boolean
  model: string
  latencyMs: number
  error?: string
  timestamp: string
}

type HealthcheckStatus = {
  lastCheck: HealthcheckResult | null
  consecutiveFailures: number
  currentModel: string
}

const status: HealthcheckStatus = {
  lastCheck: null,
  consecutiveFailures: 0,
  currentModel: getKamiConfig().model,
}

/**
 * Run a minimal healthcheck probe against the DeepSeek provider.
 * Uses a tiny prompt (one token) so the check is cheap — we only verify
 * the API key + network reach + model availability.
 */
export const runHealthcheck = async (): Promise<HealthcheckResult> => {
  const config = getKamiConfig()
  const start = Date.now()

  try {
    await completeWithDeepSeek({
      config: {
        ...config,
        maxIterations: 1,
        model: status.currentModel,
      },
      messages: [
        {
          role: "user",
          content: "ping",
        } as KamiChatMessage,
      ],
      tools: [],
    })

    const latencyMs = Date.now() - start

    status.lastCheck = {
      healthy: true,
      model: status.currentModel,
      latencyMs,
      timestamp: new Date().toISOString(),
    }
    status.consecutiveFailures = 0

    return status.lastCheck
  } catch (error) {
    const latencyMs = Date.now() - start

    status.consecutiveFailures++

    status.lastCheck = {
      healthy: false,
      model: status.currentModel,
      latencyMs,
      error:
        error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }

    return status.lastCheck
  }
}

/**
 * Switch to the fallback model after repeated failures. Returns the model
 * name that should be used for subsequent calls.
 */
export const maybeSwitchToFallback = (): string => {
  const config = getKamiConfig()

  if (status.consecutiveFailures >= 2) {
    const previous = status.currentModel

    if (previous === config.model) {
      status.currentModel = config.fallbackModel
    } else {
      status.currentModel = config.model
    }

    status.consecutiveFailures = 0

    return status.currentModel
  }

  return status.currentModel
}

/**
 * Return the model currently in use (primary or fallback). This is the model
 * the loop should pass to `completeWithDeepSeek`.
 */
export const getCurrentModel = () => status.currentModel

/**
 * Get the latest healthcheck result (or null if never run).
 */
export const getHealthStatus = () => ({ ...status })
