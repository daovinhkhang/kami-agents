import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { URL } from "node:url"
import {
  buildOpenAIRealtimeUrl,
  getOpenAIVoiceConfig,
} from "./openai"

const WebSocketLib = require("ws")

type RealtimeTicket = {
  expiresAt: number
  actorId?: string
}

type RealtimeState = {
  server?: ReturnType<typeof createServer>
  wss?: any
  port?: number
  startedAt?: string
}

const globalKey = "__kamiVoiceRealtimeState"
const ticketTtlMs = 2 * 60 * 1000
const commitIntervalMs = 1_200
const tickets = new Map<string, RealtimeTicket>()
const bindHost =
  process.env.KAMI_REALTIME_WS_BIND_HOST?.trim() || "127.0.0.1"

const state = ((globalThis as any)[globalKey] ?? {}) as RealtimeState
;(globalThis as any)[globalKey] = state

const sendJson = (socket: any, payload: Record<string, unknown>) => {
  if (socket.readyState === WebSocketLib.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

const reject = (socket: any, message: string) => {
  sendJson(socket, { type: "Error", message })
  socket.close(1008, message)
}

const consumeTicket = (ticket?: string) => {
  if (!ticket) return null

  const found = tickets.get(ticket)
  if (!found) return null

  tickets.delete(ticket)
  return found.expiresAt > Date.now() ? found : null
}

const safetyIdentifier = (actorId?: string) => {
  if (!actorId) return undefined

  return createHash("sha256").update(actorId).digest("hex")
}

const audioPayload = (data: any) => {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

  return {
    type: "input_audio_buffer.append",
    audio: buffer.toString("base64"),
  }
}

export const issueRealtimeTicket = (actorId?: string) => {
  const ticket = randomBytes(24).toString("base64url")
  const expiresAt = Date.now() + ticketTtlMs

  tickets.set(ticket, { expiresAt, actorId })

  return {
    ticket,
    expires_at: new Date(expiresAt).toISOString(),
  }
}

export const ensureVoiceRealtimeServer = () => {
  const config = getOpenAIVoiceConfig()

  if (!config.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured")
  }

  if (state.server && state.port === config.wsPort) {
    return {
      port: state.port,
      started_at: state.startedAt,
      sample_rate: config.sampleRate,
      model: config.realtimeModel,
      transcription_model: config.realtimeTranscriptionModel,
      auto_detect_language: true,
    }
  }

  const server = createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: true, service: "kami-openai-realtime" }))
  })

  const wss = new WebSocketLib.WebSocketServer({
    server,
    path: "/kami/asr/realtime",
  })

  wss.on("connection", (client: any, request: any) => {
    const requestUrl = new URL(request.url ?? "", `ws://${request.headers.host}`)
    const ticket = consumeTicket(requestUrl.searchParams.get("ticket") ?? undefined)

    if (!ticket) {
      reject(client, "Invalid or expired KAMI realtime ticket")
      return
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
    }
    const safetyId = safetyIdentifier(ticket.actorId)
    if (safetyId) {
      headers["OpenAI-Safety-Identifier"] = safetyId
    }

    const openai = new WebSocketLib(buildOpenAIRealtimeUrl(), { headers })
    let openaiOpen = false
    let hasBufferedAudio = false
    const pendingAudio: any[] = []
    const pendingCommits: string[] = []

    const sendOpenAIJson = (payload: Record<string, unknown>) => {
      if (openai.readyState === WebSocketLib.OPEN) {
        openai.send(JSON.stringify(payload))
      }
    }

    const appendAudio = (data: any) => {
      sendOpenAIJson(audioPayload(data))
      hasBufferedAudio = true
    }

    const commitAudio = () => {
      if (!hasBufferedAudio) return

      sendOpenAIJson({ type: "input_audio_buffer.commit" })
      hasBufferedAudio = false
    }

    const commitTimer = setInterval(() => {
      if (openai.readyState === WebSocketLib.OPEN && openaiOpen) {
        commitAudio()
      }
    }, commitIntervalMs)

    openai.on("open", () => {
      openaiOpen = true
      sendOpenAIJson({
        type: "session.update",
        session: {
          type: "transcription",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: config.sampleRate,
              },
              transcription: {
                model: config.realtimeTranscriptionModel,
                delay: config.realtimeTranscriptionDelay,
              },
            },
          },
        },
      })
      sendJson(client, {
        type: "KamiRealtimeReady",
        provider: "openai",
        model: config.realtimeModel,
        transcription_model: config.realtimeTranscriptionModel,
        auto_detect_language: true,
        sample_rate: config.sampleRate,
      })
      while (pendingAudio.length) {
        appendAudio(pendingAudio.shift())
      }
      while (pendingCommits.length) {
        pendingCommits.shift()
        commitAudio()
      }
    })

    openai.on("message", (data: any) => {
      if (client.readyState === WebSocketLib.OPEN) {
        client.send(data.toString())
      }
    })

    openai.on("error", (error: Error) => {
      sendJson(client, { type: "Error", message: error.message })
    })

    openai.on("close", (code: number, reason: Buffer) => {
      clearInterval(commitTimer)
      sendJson(client, {
        type: "KamiRealtimeClosed",
        code,
        reason: reason.toString(),
      })
      if (client.readyState === WebSocketLib.OPEN) {
        client.close()
      }
    })

    client.on("message", (data: any, isBinary: boolean) => {
      if (!isBinary) {
        const text = data.toString()
        if (text === "Finalize") {
          if (openai.readyState === WebSocketLib.OPEN && openaiOpen) {
            commitAudio()
          } else {
            pendingCommits.push("commit")
          }
          return
        }
        if (text === "CloseStream") {
          commitAudio()
          if (
            openai.readyState === WebSocketLib.OPEN ||
            openai.readyState === WebSocketLib.CONNECTING
          ) {
            openai.close()
          }
          return
        }
      }

      if (openai.readyState === WebSocketLib.OPEN && openaiOpen) {
        appendAudio(data)
        return
      }

      pendingAudio.push(data)
    })

    client.on("close", () => {
      clearInterval(commitTimer)
      commitAudio()
      if (
        openai.readyState === WebSocketLib.OPEN ||
        openai.readyState === WebSocketLib.CONNECTING
      ) {
        openai.close()
      }
    })
  })

  server.listen(config.wsPort, bindHost)

  state.server = server
  state.wss = wss
  state.port = config.wsPort
  state.startedAt = new Date().toISOString()

  return {
    port: config.wsPort,
    started_at: state.startedAt,
    sample_rate: config.sampleRate,
    model: config.realtimeModel,
    transcription_model: config.realtimeTranscriptionModel,
    auto_detect_language: true,
  }
}
