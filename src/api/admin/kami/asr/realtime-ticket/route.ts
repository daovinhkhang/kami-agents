import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ensureVoiceRealtimeServer, issueRealtimeTicket } from "@kami/voice/realtime-server"
import { resolveRealtimeWsUrl } from "../../utils"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  try {
    const server = ensureVoiceRealtimeServer()
    const ticket = issueRealtimeTicket(req.auth_context?.actor_id)

    res.json({
      ...ticket,
      ws_url: resolveRealtimeWsUrl(req, server.port),
      sample_rate: server.sample_rate,
      provider: "openai",
      model: server.model,
      transcription_model: server.transcription_model,
      auto_detect_language: true,
    })
  } catch (e) {
    res.status(502).json({
      type: "realtime_asr_error",
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
