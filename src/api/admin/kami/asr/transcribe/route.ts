import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { transcribeWithOpenAI } from "@kami/voice/openai"

type TranscribeBody = {
  audio_base64?: string
  mime_type?: string
}

export const POST = async (
  req: AuthenticatedMedusaRequest<TranscribeBody>,
  res: MedusaResponse
) => {
  const body = (req.body ?? req.validatedBody ?? {}) as TranscribeBody

  if (!body.audio_base64) {
    res.status(400).json({
      type: "invalid_request",
      message: "audio_base64 is required",
    })
    return
  }

  try {
    const result = await transcribeWithOpenAI({
      audio_base64: body.audio_base64,
      mime_type: body.mime_type,
    })

    res.json({
      provider: "openai",
      text: result.transcript,
      confidence: null,
      detected_language: result.detected_language,
      request_id: result.request_id,
      duration: result.duration,
      auto_detect_language: true,
      raw: result.raw,
    })
  } catch (e) {
    res.status(502).json({
      type: "asr_error",
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
