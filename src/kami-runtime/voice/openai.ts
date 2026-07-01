type OpenAIVoiceConfig = {
  apiKey?: string
  enabled: boolean
  realtimeModel: string
  transcriptionModel: string
  realtimeTranscriptionModel: string
  realtimeTranscriptionDelay?: string
  sampleRate: number
  wsPort: number
  apiBaseUrl: string
  realtimeWsUrl: string
}

type TranscribeInput = {
  audio_base64: string
  mime_type?: string
}

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "")

const mimeExtension = (mimeType?: string) => {
  const normalized = String(mimeType ?? "").split(";")[0]?.trim().toLowerCase()

  if (normalized === "audio/wav" || normalized === "audio/wave") return "wav"
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return "mp3"
  if (normalized === "audio/mp4") return "mp4"
  if (normalized === "audio/mpga") return "mpga"
  if (normalized === "audio/m4a" || normalized === "audio/x-m4a") return "m4a"
  if (normalized === "audio/webm") return "webm"

  return "webm"
}

export const getOpenAIVoiceConfig = (): OpenAIVoiceConfig => {
  const apiKey = process.env.OPENAI_API_KEY || process.env.KAMI_OPENAI_API_KEY

  return {
    apiKey,
    enabled: Boolean(apiKey),
    realtimeModel: process.env.KAMI_VOICE_MODEL || "gpt-realtime-2",
    transcriptionModel: process.env.KAMI_TRANSCRIBE_MODEL || "gpt-4o-transcribe",
    realtimeTranscriptionModel:
      process.env.KAMI_REALTIME_TRANSCRIBE_MODEL || "gpt-realtime-whisper",
    realtimeTranscriptionDelay:
      process.env.KAMI_REALTIME_TRANSCRIBE_DELAY || "low",
    sampleRate: int(process.env.KAMI_VOICE_SAMPLE_RATE, 24_000),
    wsPort: int(process.env.KAMI_VOICE_WS_PORT, 9901),
    apiBaseUrl: trimTrailingSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
    realtimeWsUrl: trimTrailingSlash(
      process.env.OPENAI_REALTIME_WS_URL || "wss://api.openai.com/v1/realtime"
    ),
  }
}

export const buildOpenAIRealtimeUrl = () => {
  const config = getOpenAIVoiceConfig()
  const params = new URLSearchParams({ model: config.realtimeModel })

  return `${config.realtimeWsUrl}?${params.toString()}`
}

const parseOpenAIText = (payload: any) => {
  if (typeof payload === "string") return payload

  return String(payload?.text ?? payload?.transcription ?? "").trim()
}

export const transcribeWithOpenAI = async (input: TranscribeInput) => {
  const config = getOpenAIVoiceConfig()

  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  const base64 = String(input.audio_base64 ?? "").replace(/^data:[^;]+;base64,/, "")
  const audio = Buffer.from(base64, "base64")

  if (!audio.length) {
    throw new Error("audio_base64 is required")
  }

  const FormDataCtor = (globalThis as any).FormData
  const BlobCtor = (globalThis as any).Blob
  const FileCtor = (globalThis as any).File

  if (!FormDataCtor || !BlobCtor) {
    throw new Error("This Node.js runtime does not expose FormData/Blob")
  }

  const mimeType = input.mime_type || "audio/webm"
  const fileName = `kami-voice.${mimeExtension(mimeType)}`
  const formData = new FormDataCtor()
  const file = FileCtor
    ? new FileCtor([new Uint8Array(audio)], fileName, { type: mimeType })
    : new BlobCtor([new Uint8Array(audio)], { type: mimeType })

  formData.append("file", file, fileName)
  formData.append("model", config.transcriptionModel)
  formData.append("response_format", "json")

  const response = await fetch(`${config.apiBaseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  } as any)

  const raw = await response.text()
  let payload: any
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = raw
  }

  if (!response.ok) {
    throw new Error(
      `OpenAI transcription failed ${response.status}: ${raw.slice(0, 500)}`
    )
  }

  return {
    transcript: parseOpenAIText(payload),
    request_id: response.headers.get("x-request-id"),
    duration: null,
    detected_language: null,
    raw: payload,
  }
}
