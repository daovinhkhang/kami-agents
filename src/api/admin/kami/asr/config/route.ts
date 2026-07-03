import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getOpenAIVoiceConfig } from "@kami/voice/openai"
import { ensureVoiceRealtimeServer } from "@kami/voice/realtime-server"
import { resolveRealtimeWsUrl } from "../../utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const config = getOpenAIVoiceConfig()
  let realtime: Record<string, unknown> = {
    enabled: false,
    ws_url_base: null,
    error: config.enabled ? null : "OPENAI_API_KEY is not configured",
  }

  if (config.enabled) {
    try {
      const server = ensureVoiceRealtimeServer()
      realtime = {
        enabled: true,
        ws_url_base: resolveRealtimeWsUrl(req, server.port),
        port: server.port,
        started_at: server.started_at,
        model: server.model,
        transcription_model: server.transcription_model,
        auto_detect_language: server.auto_detect_language,
        error: null,
      }
    } catch (e) {
      realtime = {
        enabled: false,
        ws_url_base: null,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  res.json({
    asr: {
      provider: "openai",
      enabled: config.enabled,
      modes: {
        send: config.enabled,
        realtime: Boolean(realtime.enabled),
      },
      auto_detect_language: true,
      model: config.transcriptionModel,
      realtime_model: config.realtimeModel,
      realtime_transcription_model: config.realtimeTranscriptionModel,
      sample_rate: config.sampleRate,
      realtime,
      has_api_key: config.enabled,
    },
  })
}
