import {
  CircleStack,
  CogSixTooth,
  CommandLine,
  DocumentText,
  MagnifyingGlass,
  PencilSquare,
  SquaresPlus,
} from "@medusajs/icons"
import type { ChatMessage, ContentPart, QuickAction, Row } from "./types"

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export const compact = (v: unknown, len = 120) => {
  const t = typeof v === "string" ? v : JSON.stringify(v ?? null)
  return t.length > len ? `${t.slice(0, len)}...` : t
}

export const safeJson = (value: unknown, spaces = 2) => {
  try {
    return JSON.stringify(value ?? {}, null, spaces)
  } catch {
    return "{}"
  }
}

export const recordHref = (type?: string, id?: string) => {
  if (!type || !id) return null

  const encoded = encodeURIComponent(id)
  switch (type) {
    case "order":
      return `/app/orders/${encoded}`
    case "product":
      return `/app/products/${encoded}`
    case "customer":
      return `/app/customers/${encoded}`
    case "inventory":
      return `/app/inventory?item_id=${encoded}`
    case "promotion":
      return `/app/promotions/${encoded}`
    case "region":
      return `/app/settings/regions/${encoded}`
    default:
      return null
  }
}

export const getBestSupportedAudioMimeType = () => {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ]

  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }

  return "audio/webm"
}

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const value = String(reader.result ?? "")
      resolve(value.includes(",") ? value.split(",")[1] : value)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

export const appendTranscript = (current: string, transcript: string) => {
  const text = transcript.trim()
  if (!text) return current
  if (!current.trim()) return text
  return `${current.trimEnd()} ${text}`
}

export const linear16FromFloat32 = (
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
) => {
  const ratio = inputSampleRate / outputSampleRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Int16Array(length)

  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0))
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  return output.buffer
}

export const extractRealtimeTranscript = (payload: Row) => {
  if (payload?.type === "conversation.item.input_audio_transcription.delta") {
    return {
      transcript: String(payload.delta ?? ""),
      isFinal: false,
    }
  }

  if (payload?.type === "conversation.item.input_audio_transcription.completed") {
    return {
      transcript: String(payload.transcript ?? "").trim(),
      isFinal: true,
    }
  }

  return {
    transcript: "",
    isFinal: false,
  }
}

export const detectSpeechLanguage = (text: string) => {
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) {
    return "vi-VN"
  }

  return "en-US"
}

export const cleanSpeechText = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800)

export const formatDate = (v?: string | Date | null) => {
  if (!v) return "-"
  return new Date(v).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  })
}

export const relativeTime = (v?: string | Date | null): string => {
  if (!v) return ""
  const ms = Date.now() - new Date(v).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(v)
}

export const parseSseBlock = (block: string) => {
  const data = block.split("\n").find((l) => l.startsWith("data: "))?.slice(6)
  if (!data) return null
  return JSON.parse(data)
}

export const riskColor = (risk?: string): "green" | "red" | "blue" | "orange" | "grey" | "purple" => {
  switch (risk) {
    case "read": return "green"
    case "destructive": return "red"
    case "mutating": return "orange"
    case "safe": return "blue"
    default: return "grey"
  }
}

export const toolLabel = (name: string) => name.replace(/_/g, " ")

// Map a tool name to a clean display title + an icon, opencode-style.
// The title is short and human; the target (file/query/etc) is shown separately.
export const toolIcon = (name: string) => {
  const n = name.toLowerCase()
  if (/(search|find|list|query|lookup|get|read|fetch|inspect)/.test(n)) return MagnifyingGlass
  if (/(report|document|export|template|artifact)/.test(n)) return DocumentText
  if (/(stock|inventory|product|catalog|price|order|sale)/.test(n)) return CircleStack
  if (/(create|add|new|draft|schedule|promotion|campaign)/.test(n)) return SquaresPlus
  if (/(setting|config|update|edit|adjust|fix)/.test(n)) return CogSixTooth
  if (/(run|exec|command|shell|workflow)/.test(n)) return CommandLine
  return CircleStack
}

// Pull the most meaningful "target" out of tool args for the title line,
// mirroring opencode's label() priority list.
export const toolTarget = (args?: Row): string | undefined => {
  if (!args) return undefined
  const keys = ["title", "name", "query", "q", "id", "sku", "email", "path", "file_path", "url", "type"]
  for (const key of keys) {
    const value = args[key]
    if (typeof value === "string" && value.length > 0) return value
    if (typeof value === "number") return String(value)
  }
  return undefined
}

// Flatten remaining args into short key=value chips (skipping the target keys),
// like opencode's args() helper. Caps to keep the header tidy.
export const toolArgChips = (args?: Row): string[] => {
  if (!args) return []
  const skip = new Set(["title", "name", "query", "q", "id", "sku", "email", "path", "file_path", "url", "type"])
  return Object.entries(args)
    .filter(([key]) => !skip.has(key))
    .flatMap(([key, value]) => {
      if (value == null) return []
      if (typeof value === "string") return [`${key}=${value.length > 32 ? `${value.slice(0, 32)}...` : value}`]
      if (typeof value === "number" || typeof value === "boolean") return [`${key}=${value}`]
      return [`${key}={…}`]
    })
    .slice(0, 4)
}

export const getSessionMeta = (session: Row) => session.metadata ?? {}

export const getSessionTags = (session: Row): string[] => {
  const tags = getSessionMeta(session).tags

  return Array.isArray(tags) ? tags : []
}

export const getMemoryCategory = (memory: Row) =>
  memory.metadata?.category ?? memory.type ?? "factual"

export const isMemoryDisabled = (memory: Row) => Boolean(memory.metadata?.disabled)

export const kindIcon = (kind: QuickAction["kind"]) => {
  switch (kind) {
    case "create":
      return SquaresPlus
    case "draft":
      return PencilSquare
    case "inspect":
      return MagnifyingGlass
    case "fix":
      return CogSixTooth
    case "schedule":
      return CogSixTooth
    case "export":
    case "report":
      return DocumentText
    default:
      return CircleStack
  }
}

// ── tool-result / message merging (used by the SSE stream + session load) ──

export const updateToolResultParts = (
  parts: ContentPart[],
  call: Row | undefined,
  result: unknown,
  risk?: string
): ContentPart[] => {
  const next = [...parts]
  const idx = [...next]
    .reverse()
    .findIndex((p) => p.type === "tool_call" && p.tool_name === (call?.name ?? ""))

  if (idx === -1) return next

  const realIdx = next.length - 1 - idx
  const part = next[realIdx] as ContentPart & { type: "tool_call" }
  next[realIdx] = {
    ...part,
    args: part.args ?? call?.arguments,
    result,
    risk: risk ?? part.risk ?? "safe",
  }

  return next
}

// Stable empty array so sessions with no messages don't re-render on every
// state change (a fresh `[]` literal would break referential equality).
export const EMPTY_MESSAGES: ChatMessage[] = []

export const mergeToolMessages = (messages: ChatMessage[]) => {
  const merged: ChatMessage[] = []

  for (const msg of messages) {
    const toolPart = msg.content_parts?.find((p) => p.type === "tool_call") as
      | (ContentPart & { type: "tool_call" })
      | undefined

    if (msg.role === "tool" && toolPart) {
      const assistantIdx = [...merged]
        .reverse()
        .findIndex((m) => m.role === "assistant" && m.content_parts?.some((p) => p.type === "tool_call" && p.tool_name === toolPart.tool_name))

      if (assistantIdx !== -1) {
        const realIdx = merged.length - 1 - assistantIdx
        const assistant = merged[realIdx]
        merged[realIdx] = {
          ...assistant,
          content_parts: updateToolResultParts(
            assistant.content_parts ?? [],
            { name: toolPart.tool_name, arguments: toolPart.args },
            toolPart.result ?? msg.content,
            toolPart.risk
          ),
        }
      }

      continue
    }

    merged.push(msg)
  }

  return merged
}
