"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  Copy,
  Drawer,
  DropdownMenu,
  Heading,
  IconButton,
  Input,
  Text,
  Textarea,
  Tooltip,
  TooltipProvider,
  toast,
} from "@medusajs/ui"
import {
  ChevronDownMini,
  CircleStack,
  CogSixTooth,
  CommandLine,
  DocumentText,
  ExclamationCircle,
  LightBulb,
  MagnifyingGlass,
  PencilSquare,
  SquaresPlus,
} from "@medusajs/icons"
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>

type ChatMessage = {
  role: "user" | "assistant" | "tool" | "system"
  content: string
  tool_calls?: Row[]
  content_parts?: ContentPart[]
  metadata?: Row
  created_at?: string
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "think"; think: string }
  | { type: "tool_call"; tool_name: string; args?: Row; result?: unknown; risk?: string }
  | { type: "trace"; steps: TraceStep[] }
  | { type: "ui_command"; command: UiCommand }
  | { type: "draft"; draft: CommerceDraftPayload; artifact_id?: string }
  | { type: "error"; error: string }

type TabId = "approvals" | "audit" | "memory" | "skills" | "cron" | "gateways" | "settings" | "autonomy" | "evals"

type TraceStep = {
  index: number
  tool: string
  status: "running" | "done" | "error"
  label: string
}

type QuickAction = {
  label: string
  description?: string
  kind: "create" | "export" | "schedule" | "inspect" | "fix" | "report" | "draft"
  tool: string
  args: Row
  risk: string
  confirm_required?: boolean
  artifact_id?: string
  session_id?: string
}

type UiCommand = {
  action:
    | "open_panel"
    | "open_artifact"
    | "open_drawer"
    | "open_draft"
    | "focus_record"
    | "highlight_issue"
    | "request_confirmation"
  panel?: "report" | "draft" | "record" | "debug" | "approvals" | "memory" | "cron" | "settings" | "autonomy" | "evals"
  tab?: string
  artifact_id?: string
  draft_id?: string
  record_type?: "order" | "product" | "customer" | "inventory" | "promotion" | "region" | "other"
  record_id?: string
  title?: string
  reason?: string
  severity?: "info" | "warning" | "critical"
  metadata?: Row
}

type CommerceDraftPayload = {
  version: "1.0"
  draft_type:
    | "product"
    | "order"
    | "promotion"
    | "customer"
    | "campaign"
    | "inventory_adjustment"
    | "shipping_fix"
    | "schedule"
    | "report_template"
    | "custom"
  title: string
  description?: string
  status: "pending" | "executed" | "dismissed" | "approval_required" | "error"
  target_tool: string
  args: Row
  risk: "read" | "safe" | "mutating" | "destructive"
  confirm_required: boolean
  created_at: string
  updated_at?: string
  executed_at?: string
  execution_result?: unknown
  timezone: "Asia/Ho_Chi_Minh"
  utc_offset: "UTC+7"
  metadata?: Row
}

type VoiceConfig = {
  provider: "openai"
  enabled: boolean
  modes: {
    send: boolean
    realtime: boolean
  }
  auto_detect_language: boolean
  model: string
  realtime_model: string
  realtime_transcription_model: string
  sample_rate: number
  realtime: {
    enabled: boolean
    ws_url_base?: string | null
    port?: number
    model?: string
    transcription_model?: string
    auto_detect_language?: boolean
    error?: string | null
  }
}

type VoiceState = "idle" | "recording" | "transcribing" | "sending" | "speaking" | "connecting" | "live"

type ArtifactSection =
  | { type: "kpi"; title: string; cards: Array<{ label: string; value: string; trend?: string; delta?: string }> }
  | { type: "table"; title: string; columns: Array<{ key: string; label: string; align?: string }>; rows: Row[]; total_rows: number }
  | { type: "chart"; title: string; chart_type: string; data: { labels: string[]; datasets: Array<{ label: string; values: number[] }> } }
  | { type: "text"; title?: string; content: string }

type ArtifactPayload = {
  version: "1.0"
  title: string
  generated_at: string
  timezone: string
  utc_offset: string
  date_range: { from: string; to: string; label: string }
  sections: ArtifactSection[]
  data_sources: Array<{ tool: string; run_at: string; row_count: number }>
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getJson = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, { credentials: "include" })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const postJson = async <T,>(path: string, body: Row): Promise<T> => {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const patchJson = async <T,>(path: string, body: Row): Promise<T> => {
  const r = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const deleteJson = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, {
    method: "DELETE",
    credentials: "include",
  })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

const compact = (v: unknown, len = 120) => {
  const t = typeof v === "string" ? v : JSON.stringify(v ?? null)
  return t.length > len ? `${t.slice(0, len)}...` : t
}

const safeJson = (value: unknown, spaces = 2) => {
  try {
    return JSON.stringify(value ?? {}, null, spaces)
  } catch {
    return "{}"
  }
}

const recordHref = (type?: string, id?: string) => {
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

const getBestSupportedAudioMimeType = () => {
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

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const value = String(reader.result ?? "")
      resolve(value.includes(",") ? value.split(",")[1] : value)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const appendTranscript = (current: string, transcript: string) => {
  const text = transcript.trim()
  if (!text) return current
  if (!current.trim()) return text
  return `${current.trimEnd()} ${text}`
}

const linear16FromFloat32 = (
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

const extractRealtimeTranscript = (payload: Row) => {
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

const detectSpeechLanguage = (text: string) => {
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) {
    return "vi-VN"
  }

  return "en-US"
}

const cleanSpeechText = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800)

const formatDate = (v?: string | Date | null) => {
  if (!v) return "-"
  return new Date(v).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
  })
}

const relativeTime = (v?: string | Date | null): string => {
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

const parseSseBlock = (block: string) => {
  const data = block.split("\n").find((l) => l.startsWith("data: "))?.slice(6)
  if (!data) return null
  return JSON.parse(data)
}

const riskColor = (risk?: string): "green" | "red" | "blue" | "orange" | "grey" | "purple" => {
  switch (risk) {
    case "read": return "green"
    case "destructive": return "red"
    case "mutating": return "orange"
    case "safe": return "blue"
    default: return "grey"
  }
}

const toolLabel = (name: string) => name.replace(/_/g, " ")

// Map a tool name to a clean display title + an icon, opencode-style.
// The title is short and human; the target (file/query/etc) is shown separately.
const toolIcon = (name: string) => {
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
const toolTarget = (args?: Row): string | undefined => {
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
const toolArgChips = (args?: Row): string[] => {
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

const getSessionMeta = (session: Row) => session.metadata ?? {}

const getSessionTags = (session: Row): string[] => {
  const tags = getSessionMeta(session).tags

  return Array.isArray(tags) ? tags : []
}

const getMemoryCategory = (memory: Row) =>
  memory.metadata?.category ?? memory.type ?? "factual"

const isMemoryDisabled = (memory: Row) => Boolean(memory.metadata?.disabled)

/* ------------------------------------------------------------------ */
/*  CSS Animations (injected once)                                      */
/* ------------------------------------------------------------------ */

const injectStyles = () => {
  if (typeof document === "undefined") return
  const id = "kami-animations"
  if (document.getElementById(id)) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = `
    @keyframes kami-fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes kami-pulse-dot {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 1; }
    }
    @keyframes kami-stream-caret {
      0%, 45% { opacity: 1; }
      46%, 100% { opacity: 0; }
    }
    .kami-fade-in {
      animation: kami-fadeIn 0.3s ease-out;
    }
    .kami-msg-enter {
      animation: kami-fadeIn 0.25s ease-out;
    }
    .kami-thinking-dot { animation: kami-pulse-dot 1.4s infinite ease-in-out; }
    .kami-thinking-dot:nth-child(2) { animation-delay: 0.2s; }
    .kami-thinking-dot:nth-child(3) { animation-delay: 0.4s; }
    .kami-stream-caret {
      display: inline-block;
      width: 2px;
      height: 1em;
      margin-left: 3px;
      border-radius: 999px;
      background: currentColor;
      animation: kami-stream-caret 1s infinite;
      vertical-align: -0.12em;
    }
    @keyframes kami-slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes kami-slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes kami-slideInLeft {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes kami-slideOutLeft {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(-100%); opacity: 0; }
    }
    .kami-panel-slide-in {
      animation: kami-slideInRight 0.25s ease-out;
    }
    .kami-panel-slide-out {
      animation: kami-slideOutRight 0.25s ease-in forwards;
    }
    @keyframes kami-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .kami-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(99, 102, 241, 0.22);
      border-right-color: #6366f1;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: kami-spin 0.8s linear infinite;
      flex-shrink: 0;
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.08);
    }
    @media (prefers-reduced-motion: reduce) {
      .kami-spinner { animation: none; }
      .kami-panel-slide-in, .kami-panel-slide-out { animation: none; }
    }

    /* ===== MOBILE RESPONSIVE (<768px) ===== */
    @media (max-width: 767px) {
      /* Top bar — compact */
      .kami-topbar { padding: 6px 10px !important; gap: 4px !important; flex-wrap: wrap !important; }
      .kami-topbar-left { gap: 6px !important; }
      .kami-topbar-right {
        gap: 2px !important;
        overflow-x: auto;
        flex-wrap: nowrap;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        padding-bottom: 4px;
      }
      .kami-topbar-right::-webkit-scrollbar { display: none; }
      .kami-topbar .kami-topbar-desktop-btn { display: none !important; }
      .kami-topbar .kami-hamburger-btn { display: inline-flex !important; }

      /* Sidebar overlay */
      .kami-sidebar-overlay {
        position: fixed !important;
        inset: 0;
        z-index: 50;
        background: rgba(0,0,0,0.4);
      }
      .kami-sidebar-panel {
        position: fixed !important;
        top: 0; left: 0; bottom: 0;
        width: 280px !important;
        max-width: 85vw;
        z-index: 51;
        box-shadow: 4px 0 24px rgba(0,0,0,0.15);
      }
      .kami-sidebar-panel.kami-slide-in-left {
        animation: kami-slideInLeft 0.2s ease-out;
      }
      .kami-sidebar-panel.kami-slide-out-left {
        animation: kami-slideOutLeft 0.2s ease-in forwards;
      }

      /* Right panels — fullscreen overlay on mobile */
      .kami-right-panel {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        min-width: 100vw !important;
        z-index: 40;
        border-left: none !important;
      }
      .kami-right-panel .kami-panel-slide-in {
        animation: kami-slideInRight 0.2s ease-out;
      }
      .kami-right-panel .kami-panel-slide-out {
        animation: kami-slideOutRight 0.2s ease-in forwards;
      }

      /* Chat area */
      .kami-chat-area { padding-left: 8px !important; padding-right: 8px !important; }
      .kami-messages-area { padding: 8px !important; }

      /* Message bubbles — wider on mobile */
      .kami-msg-bubble {
        max-width: 92% !important;
      }

      /* Execution trace — compact */
      .kami-execution-trace .kami-trace-summary { gap: 2px !important; }
      .kami-execution-trace .kami-trace-steps { flex-wrap: wrap !important; }

      /* Input area */
      .kami-input-area { padding: 8px 10px !important; }
      .kami-input-composer { border-radius: 12px !important; }

      /* Welcome state */
      .kami-welcome { padding: 16px !important; }
      .kami-welcome-suggestions { gap: 6px !important; }
      .kami-welcome-suggestions button { padding: 6px 10px !important; font-size: 11px !important; }

      /* Drawer — Medusa's Drawer adapts but we ensure scroll */
      [data-kami-drawer-body] { max-height: 70vh !important; }

      /* Bottom safe-area for phones with notch */
      .kami-input-area {
        padding-bottom: max(8px, env(safe-area-inset-bottom, 8px)) !important;
      }

      /* Touch-friendly targets */
      .kami-touch-btn {
        min-width: 36px !important;
        min-height: 36px !important;
        padding: 6px 10px !important;
        font-size: 12px !important;
      }
    }

    /* ===== TABLET (768px–1023px) ===== */
    @media (min-width: 768px) and (max-width: 1023px) {
      .kami-topbar-right { gap: 2px !important; }
      .kami-topbar .kami-topbar-desktop-btn { font-size: 10px !important; padding: 4px 6px !important; }
      .kami-right-panel { width: 360px !important; min-width: 360px !important; }
    }
  `
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ */
/*  Markdown Components                                                */
/* ------------------------------------------------------------------ */

/** GFM-capable markdown renderer (react-markdown + remark-gfm) styled with
 *  Medusa UI tokens. Replaces the former hand-rolled parser, which mangled
 *  tables with empty cells, nested lists, nested emphasis, h4-h6, blockquotes,
 *  strikethrough, and alignment rows. */
const CodeBlock = ({ code, lang }: { code: string; lang?: string }) => (
  <div className="group relative my-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
    <div className="flex items-center justify-between border-b border-ui-border-base px-3 py-1.5">
      <Text size="xsmall" className="text-ui-fg-muted font-mono">{lang || "code"}</Text>
      <Copy content={code} />
    </div>
    <pre className="overflow-x-auto p-3">
      <code className="font-mono text-xs whitespace-pre text-ui-fg-base">{code}</code>
    </pre>
  </div>
)

const markdownComponents = {
  h1: ({ children }: any) => <div className="text-lg font-bold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h2: ({ children }: any) => <div className="text-base font-semibold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h3: ({ children }: any) => <div className="text-sm font-semibold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h4: ({ children }: any) => <div className="text-sm font-semibold text-ui-fg-base mt-2 mb-1">{children}</div>,
  h5: ({ children }: any) => <div className="text-xs font-semibold text-ui-fg-subtle mt-2 mb-0.5">{children}</div>,
  h6: ({ children }: any) => <div className="text-xs font-semibold text-ui-fg-muted mt-2 mb-0.5">{children}</div>,
  p: ({ children }: any) => <p className="text-sm text-ui-fg-base my-1 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 my-1.5 space-y-0.5 text-sm text-ui-fg-base">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5 text-sm text-ui-fg-base">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-ui-fg-base">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em>{children}</em>,
  del: ({ children }: any) => <del className="text-ui-fg-muted">{children}</del>,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ui-fg-interactive underline">
      {children}
    </a>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 border-l-2 border-ui-border-strong pl-3 text-sm italic text-ui-fg-subtle">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-ui-border-base" />,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-ui-border-base text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead>{children}</thead>,
  th: ({ children, style }: any) => (
    <th style={style} className="border border-ui-border-base bg-ui-bg-subtle px-2 py-1 font-semibold text-ui-fg-base">{children}</th>
  ),
  td: ({ children, style }: any) => (
    <td style={style} className="border border-ui-border-base px-2 py-1 text-ui-fg-base">{children}</td>
  ),
  code: ({ inline, className, children }: any) => {
    const text = String(children ?? "").replace(/\n$/, "")
    const langMatch = /language-(\w+)/.exec(className ?? "")
    // react-markdown v10 drops the `inline` flag; a fenced block wraps its code
    // in a <pre>, so we detect a block by the presence of a language class or a
    // trailing newline. Everything else renders as inline code.
    const isBlock = Boolean(langMatch) || text.includes("\n")
    if (!inline && isBlock) {
      return <CodeBlock code={text} lang={langMatch?.[1]} />
    }
    return <code className="rounded bg-ui-bg-subtle px-1 py-0.5 font-mono text-xs text-ui-fg-base">{children}</code>
  },
  pre: ({ children }: any) => <>{children}</>,
}

// react-markdown v10 and remark-gfm v4 are ESM-only. Under tsc's Node16 module
// mode this file is treated as CommonJS, so a static import is rejected. A lazy
// dynamic import satisfies both tsc and the Vite bundler, and yields a
// plain-text fallback while the chunk loads.
const LazyMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ])
  return {
    default: ({ text }: { text: string }) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    ),
  }
})

const KamiMarkdown = ({ text }: { text: string }) => (
  <Suspense fallback={<p className="text-sm text-ui-fg-base my-1 whitespace-pre-wrap">{text}</p>}>
    <LazyMarkdown text={text} />
  </Suspense>
)

/* ------------------------------------------------------------------ */
/*  Message Components                                                 */
/* ------------------------------------------------------------------ */

const updateToolResultParts = (
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
const EMPTY_MESSAGES: ChatMessage[] = []

const mergeToolMessages = (messages: ChatMessage[]) => {
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

// A small chevron that rotates when its collapsible is open.
const Chevron = ({ open }: { open: boolean }) => (
  <ChevronDownMini
    className={`shrink-0 text-ui-fg-muted transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
  />
)

// Collapsible "Thinking" block — the model's reasoning, rendered as markdown.
// Mirrors opencode's reasoning card: quiet by default, expandable.
const ThinkingBlock = ({ thought, active }: { thought: string; active?: boolean }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle kami-fade-in">
      <button
        type="button"
        className="flex w-full items-center gap-x-2 px-3 py-2 text-left hover:bg-ui-bg-base-hover"
        onClick={() => setOpen(!open)}
      >
        <LightBulb className="shrink-0 text-ui-fg-muted" />
        <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
          {active ? "Thinking" : "Thought"}
        </Text>
        {active && (
          <span className="flex gap-0.5">
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
          </span>
        )}
        <span className="ml-auto">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div className="border-t border-ui-border-base px-3 py-2.5">
          <Text
            size="xsmall"
            className="max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed text-ui-fg-subtle"
          >
            {thought}
          </Text>
        </div>
      )}
    </div>
  )
}

// A single tool call rendered as a collapsible card, opencode-style:
// icon + clean title + target + arg chips in the header; args/result in the body.
const ToolCard = ({
  tool,
  active,
}: {
  tool: ContentPart & { type: "tool_call" }
  active?: boolean
}) => {
  const pending = tool.result === undefined
  const running = Boolean(active && pending)
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(tool.tool_name)
  const target = toolTarget(tool.args)
  const chips = toolArgChips(tool.args)

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base kami-fade-in">
      <button
        type="button"
        className="flex w-full items-center gap-x-2 px-3 py-2 text-left hover:bg-ui-bg-base-hover"
        onClick={() => setOpen(!open)}
      >
        {running ? (
          <span className="kami-spinner" />
        ) : (
          <Icon className="shrink-0 text-ui-fg-subtle" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-x-2">
          <Text size="xsmall" weight="plus" className="shrink-0 text-ui-fg-base">
            {toolLabel(tool.tool_name)}
          </Text>
          {target && (
            <Text size="xsmall" className="truncate font-mono text-ui-fg-subtle">
              {target}
            </Text>
          )}
          {chips.slice(0, 2).map((chip, i) => (
            <span
              key={i}
              className="hidden shrink-0 rounded bg-ui-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ui-fg-muted sm:inline"
            >
              {chip}
            </span>
          ))}
        </div>
        <Badge size="2xsmall" color={riskColor(tool.risk)}>
          {tool.risk ?? "safe"}
        </Badge>
        {running && (
          <Text size="xsmall" className="text-ui-fg-interactive">
            running
          </Text>
        )}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-ui-border-base px-3 py-2.5">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <Text size="xsmall" weight="plus" className="mb-1 text-ui-fg-muted">
                Input
              </Text>
              <pre className="max-h-48 overflow-auto rounded bg-ui-bg-subtle px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ui-fg-subtle">
                {safeJson(tool.args)}
              </pre>
            </div>
          )}
          {!pending && (
            <div>
              <Text size="xsmall" weight="plus" className="mb-1 text-ui-fg-muted">
                Result
              </Text>
              <pre className="max-h-64 overflow-auto rounded bg-ui-bg-subtle px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ui-fg-subtle">
                {typeof tool.result === "string" ? tool.result : safeJson(tool.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Renders the reasoning + tool timeline for an assistant turn as a flat stack
// of cards (thinking first, then each tool), matching opencode's clean layout.
const ExecutionTrace = ({
  thought,
  tools,
  isStreaming,
}: {
  thought?: string
  tools: Array<ContentPart & { type: "tool_call" }>
  isStreaming?: boolean
}) => {
  const active = Boolean(isStreaming && (thought || tools.some((tool) => tool.result === undefined)))

  if (!thought && tools.length === 0) return null

  return (
    <div className="my-1.5 w-full space-y-1.5">
      {thought && <ThinkingBlock thought={thought} active={active && !tools.length} />}
      {tools.map((tool, i) => (
        <ToolCard key={`${tool.tool_name}-${i}`} tool={tool} active={active} />
      ))}
    </div>
  )
}

const AssistantLoading = () => (
  <div className="flex items-center gap-x-1.5 py-1.5">
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
  </div>
)

// Dedicated error card with a copy button, opencode's ToolErrorCard-style.
const ErrorBlock = ({ error }: { error: string }) => {
  const cleaned = error.replace(/^Error:\s*/, "").trim()
  const [head, ...restParts] = cleaned.split(": ")
  const hasSplit = restParts.length > 0
  const subtitle = hasSplit ? head.trim() : "Failed"
  const body = hasSplit ? restParts.join(": ").trim() : cleaned

  return (
    <div className="overflow-hidden rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg kami-fade-in">
      <div className="flex items-start gap-x-2 px-3 py-2">
        <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-red-icon" />
        <div className="min-w-0 flex-1">
          <Text size="xsmall" weight="plus" className="text-ui-tag-red-text">
            {subtitle}
          </Text>
          {body && (
            <Text size="xsmall" className="mt-0.5 whitespace-pre-wrap break-words text-ui-tag-red-text opacity-90">
              {body}
            </Text>
          )}
        </div>
        <Copy content={cleaned} className="shrink-0 text-ui-tag-red-text" />
      </div>
    </div>
  )
}

const kindIcon = (kind: QuickAction["kind"]) => {
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

const QuickActionCards = ({
  actions,
  onAction,
}: {
  actions?: QuickAction[]
  onAction: (action: QuickAction) => Promise<void>
}) => {
  if (!actions?.length) return null

  return (
    <div className="pt-1">
      <div className="mb-1.5 flex items-center gap-x-1.5 px-0.5">
        <LightBulb className="text-ui-fg-muted" />
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
          Đề xuất tiếp theo
        </Text>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {actions.map((action, index) => {
          const Icon = kindIcon(action.kind)
          return (
            <button
              key={`${action.tool}-${index}`}
              className="group flex items-start gap-x-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-left transition-colors hover:border-ui-border-interactive hover:bg-ui-bg-base-hover"
              onClick={() => onAction(action)}
            >
              <span className="mt-0.5 shrink-0 text-ui-fg-muted transition-colors group-hover:text-ui-fg-interactive">
                <Icon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-x-2">
                  <Text
                    size="xsmall"
                    weight="plus"
                    className="truncate text-ui-fg-base"
                  >
                    {action.label}
                  </Text>
                  <Badge size="2xsmall" color={riskColor(action.risk)}>
                    {action.kind}
                  </Badge>
                </div>
                {action.description && (
                  <Text
                    size="xsmall"
                    className="mt-0.5 line-clamp-2 text-ui-fg-subtle"
                  >
                    {action.description}
                  </Text>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const ChatMessageBubble = ({
  msg,
  isStreaming,
  onQuickAction,
}: {
  msg: ChatMessage
  isStreaming?: boolean
  onQuickAction: (action: QuickAction) => Promise<void>
}) => {
  const isUser = msg.role === "user"
  const isTool = msg.role === "tool"
  const parts: ContentPart[] = msg.content_parts ?? []
  const thought = parts.find((p) => p.type === "think")?.think
  const tools = parts.filter((p) => p.type === "tool_call") as Array<ContentPart & { type: "tool_call" }>

  if (isTool) {
    if (parts.some((part) => part.type === "error")) {
      return (
        <div className="flex justify-start pl-8 kami-msg-enter">
          <div className="w-full max-w-full space-y-1">
            {parts.filter((part) => part.type === "error").map((part, i) => (
              <ErrorBlock key={i} error={(part as any).error} />
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} kami-msg-enter`}>
      <div className={`kami-msg-bubble flex gap-x-3 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full mt-0.5 ${isUser ? "bg-ui-tag-blue-bg" : "bg-ui-tag-purple-bg"}`}>
          <Text size="xsmall" weight="plus" className={isUser ? "text-ui-tag-blue-text" : "text-ui-tag-purple-text"}>
            {isUser ? "U" : "K"}
          </Text>
        </div>

        {/* Content */}
        <div className={`flex min-w-0 flex-1 flex-col space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
          <ExecutionTrace thought={thought} tools={tools} isStreaming={isStreaming} />

          {/* Text content */}
          {isUser ? (
            <div className="max-w-full rounded-2xl rounded-tr-sm bg-ui-tag-blue-bg px-3.5 py-2">
              <Text size="small" className="whitespace-pre-wrap break-words text-ui-tag-blue-text">
                {msg.content}
              </Text>
            </div>
          ) : msg.content ? (
            <div className="max-w-full overflow-hidden rounded-2xl rounded-tl-sm border border-ui-border-base bg-ui-bg-base px-3.5 py-2">
              <KamiMarkdown text={msg.content} />
              {isStreaming && <span className="kami-stream-caret text-ui-fg-interactive" />}
            </div>
          ) : (
            // No text yet. Only show the loading dots when nothing else is
            // rendered (no thinking, no tools) so we don't stack a redundant
            // empty bubble under the tool cards. Once the turn is done with no
            // text (tools-only turn), render nothing instead of an empty box.
            isStreaming && !thought && tools.length === 0 && (
              <div className="rounded-2xl rounded-tl-sm border border-ui-border-base bg-ui-bg-base px-3.5 py-2">
                <AssistantLoading />
              </div>
            )
          )}

          {parts.filter((p) => p.type === "error").map((part, i) => (
            <ErrorBlock key={i} error={(part as any).error} />
          ))}

          {/* Timestamp on hover */}
          {msg.created_at && (
            <Text size="xsmall" className="text-ui-fg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {relativeTime(msg.created_at)}
            </Text>
          )}

          {!isUser && (
            <QuickActionCards
              actions={msg.metadata?.quick_actions as QuickAction[] | undefined}
              onAction={onQuickAction}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const ArtifactPanel = ({
  report,
  onClose,
}: {
  report: Row | null
  onClose: () => void
}) => {
  const [tab, setTab] = useState<"report" | "table" | "chart" | "export">("report")

  useEffect(() => {
    setTab("report")
  }, [report?.id])

  const [isClosing, setIsClosing] = useState(false)

  // Nothing to show and not mid-close animation — bail out
  if (!report && !isClosing) return null

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, 250)
  }

  // Slide-in when opening fresh, slide-out when user clicks Hide
  const animClass = report && !isClosing
    ? "kami-panel-slide-in"
    : "kami-panel-slide-out"

  const payload = report!.payload as ArtifactPayload
  const sections = payload?.sections ?? []
  const tables = sections.filter((section) => section.type === "table") as Array<Extract<ArtifactSection, { type: "table" }>>
  const charts = sections.filter((section) => section.type === "chart") as Array<Extract<ArtifactSection, { type: "chart" }>>
  const kpis = sections.filter((section) => section.type === "kpi") as Array<Extract<ArtifactSection, { type: "kpi" }>>
  const textSections = sections.filter((section) => section.type === "text") as Array<Extract<ArtifactSection, { type: "text" }>>

  const download = (format: "csv" | "markdown") => {
    window.open(`/admin/kami/reports/${report!.id}/export?format=${format}`, "_blank")
  }

  return (
    <div className={`kami-right-panel flex min-h-0 w-[420px] shrink-0 flex-col border-l border-ui-border-base bg-ui-bg-base ${animClass}`}>
      <div className="border-b border-ui-border-base px-4 py-3">
        <div className="flex items-start justify-between gap-x-3">
          <div className="min-w-0">
            <Heading level="h2" className="!text-base truncate">
              {payload?.title ?? report!.title ?? "KAMI Report"}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted">
              {payload?.date_range?.label ?? "Current context"} · {payload?.utc_offset ?? "UTC+7"}
            </Text>
          </div>
          <Button size="small" variant="transparent" onClick={handleClose}>
            Hide
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-md bg-ui-bg-subtle p-1">
          {(["report", "table", "chart", "export"] as const).map((item) => (
            <button
              key={item}
              className={`rounded px-2 py-1 text-xs capitalize ${tab === item ? "bg-ui-bg-base text-ui-fg-base shadow-sm" : "text-ui-fg-subtle hover:text-ui-fg-base"}`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "report" && (
          <div className="space-y-4">
            {kpis.map((section, sectionIndex) => (
              <div key={`kpi-${sectionIndex}`} className="space-y-2">
                <Text size="small" weight="plus">{section.title}</Text>
                <div className="grid grid-cols-2 gap-2">
                  {section.cards.map((card, cardIndex) => (
                    <div key={`${card.label}-${cardIndex}`} className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3">
                      <Text size="xsmall" className="text-ui-fg-muted">{card.label}</Text>
                      <Text size="base" weight="plus" className="mt-1 text-ui-fg-base">{card.value}</Text>
                      {card.delta && <Text size="xsmall" className="text-ui-fg-subtle">{card.delta}</Text>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {textSections.map((section, index) => (
              <div key={`text-${index}`} className="rounded-md border border-ui-border-base p-3">
                {section.title && <Text size="small" weight="plus" className="mb-2">{section.title}</Text>}
                <KamiMarkdown text={section.content} />
              </div>
            ))}
            <div className="rounded-md border border-ui-border-base p-3">
              <Text size="small" weight="plus" className="mb-2">Sources</Text>
              <div className="space-y-1">
                {(payload?.data_sources ?? []).map((source, index) => (
                  <div key={`${source.tool}-${index}`} className="flex items-center justify-between gap-x-3">
                    <Text size="xsmall" className="truncate text-ui-fg-subtle">{toolLabel(source.tool)}</Text>
                    <Text size="xsmall" className="text-ui-fg-muted">{source.row_count} rows</Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "table" && (
          <div className="space-y-4">
            {tables.length ? tables.map((section, sectionIndex) => (
              <div key={`table-${sectionIndex}`} className="space-y-2">
                <Text size="small" weight="plus">{section.title}</Text>
                <div className="overflow-x-auto rounded-md border border-ui-border-base">
                  <table className="min-w-full text-xs">
                    <thead className="bg-ui-bg-subtle">
                      <tr>
                        {section.columns.map((column) => (
                          <th key={column.key} className={`px-2 py-2 text-left font-medium ${column.align === "right" ? "text-right" : ""}`}>
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-t border-ui-border-base">
                          {section.columns.map((column) => (
                            <td key={column.key} className={`px-2 py-2 ${column.align === "right" ? "text-right" : ""}`}>
                              {String(row[column.key] ?? "-")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Text size="xsmall" className="text-ui-fg-muted">{section.total_rows} rows</Text>
              </div>
            )) : <Text size="small" className="text-ui-fg-subtle">No table sections in this report.</Text>}
          </div>
        )}

        {tab === "chart" && (
          <div className="space-y-4">
            {charts.length ? charts.map((section, sectionIndex) => {
              const values = section.data.datasets[0]?.values ?? []
              const max = Math.max(...values, 1)

              return (
                <div key={`chart-${sectionIndex}`} className="rounded-md border border-ui-border-base p-3">
                  <Text size="small" weight="plus" className="mb-3">{section.title}</Text>
                  <div className="space-y-2">
                    {section.data.labels.map((label, index) => {
                      const value = values[index] ?? 0

                      return (
                        <div key={`${label}-${index}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-x-2">
                            <Text size="xsmall" className="truncate text-ui-fg-subtle">{label}</Text>
                            <Text size="xsmall" className="text-ui-fg-muted">{value}</Text>
                          </div>
                          <div className="h-2 rounded-full bg-ui-bg-subtle">
                            <div className="h-2 rounded-full bg-ui-fg-interactive" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }) : <Text size="small" className="text-ui-fg-subtle">No chart sections in this report.</Text>}
          </div>
        )}

        {tab === "export" && (
          <div className="space-y-3">
            <Button className="w-full" variant="secondary" onClick={() => download("csv")}>
              Download CSV
            </Button>
            <Button className="w-full" variant="secondary" onClick={() => download("markdown")}>
              Download Markdown
            </Button>
            <div className="rounded-md border border-ui-border-base p-3">
              <Text size="small" weight="plus">Export scope</Text>
              <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                CSV exports table sections. Markdown exports the full report summary.
              </Text>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const UiCommandPanel = ({
  command,
  onClose,
}: {
  command: UiCommand | null
  onClose: () => void
}) => {
  if (!command) return null

  const href = recordHref(command.record_type, command.record_id)
  const severity = command.severity ?? "info"

  return (
    <div className="kami-right-panel flex min-h-0 w-[420px] shrink-0 flex-col border-l border-ui-border-base bg-ui-bg-base">
      <div className="border-b border-ui-border-base px-4 py-3">
        <div className="flex items-start justify-between gap-x-3">
          <div className="min-w-0">
            <Heading level="h2" className="!text-base truncate">
              {command.title ?? "KAMI Focus"}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted">
              {command.action.replace(/_/g, " ")}
            </Text>
          </div>
          <Button size="small" variant="transparent" onClick={onClose}>
            Hide
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="rounded-md border border-ui-border-base p-3">
          <div className="mb-2 flex items-center gap-x-2">
            <Badge color={severity === "critical" ? "red" : severity === "warning" ? "orange" : "blue"}>
              {severity}
            </Badge>
            {command.panel && <Badge>{command.panel}</Badge>}
          </div>
          {command.reason && (
            <Text size="small" className="whitespace-pre-wrap text-ui-fg-base">
              {command.reason}
            </Text>
          )}
          {command.record_id && (
            <div className="mt-3 rounded-md bg-ui-bg-subtle p-2">
              <Text size="xsmall" weight="plus">Record</Text>
              <Text size="xsmall" className="break-all text-ui-fg-subtle">
                {command.record_type ?? "record"} · {command.record_id}
              </Text>
            </div>
          )}
        </div>
        {href && (
          <Button size="small" variant="secondary" className="w-full" onClick={() => window.open(href, "_blank")}>
            Open record
          </Button>
        )}
        {command.metadata && Object.keys(command.metadata).length > 0 && (
          <div className="rounded-md border border-ui-border-base p-3">
            <Text size="small" weight="plus" className="mb-2">Context</Text>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ui-fg-subtle">
              {safeJson(command.metadata)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

const DraftPanel = ({
  draft,
  onClose,
  onSave,
  onExecute,
  onDismiss,
}: {
  draft: Row | null
  onClose: () => void
  onSave: (draft: Row, args: Row) => Promise<Row | null>
  onExecute: (draft: Row, args: Row) => Promise<void>
  onDismiss: (draft: Row) => Promise<void>
}) => {
  const payload = draft?.payload as CommerceDraftPayload | undefined
  const [argsText, setArgsText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setArgsText(safeJson(payload?.args ?? {}))
    setError(null)
  }, [draft?.id])

  if (!draft || !payload) return null

  const parseArgs = () => {
    try {
      const parsed = JSON.parse(argsText || "{}")
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Draft args must be a JSON object")
      }
      setError(null)
      return parsed as Row
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      return null
    }
  }

  const save = async () => {
    const args = parseArgs()
    if (!args) return
    setBusy(true)
    try {
      await onSave(draft, args)
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    const args = parseArgs()
    if (!args) return

    if (payload.confirm_required || payload.risk === "mutating" || payload.risk === "destructive") {
      const ok = window.confirm(`Execute draft "${payload.title}" with tool ${payload.target_tool}?`)
      if (!ok) return
    }

    setBusy(true)
    try {
      await onExecute(draft, args)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    const ok = window.confirm(`Dismiss draft "${payload.title}"?`)
    if (!ok) return
    setBusy(true)
    try {
      await onDismiss(draft)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="kami-right-panel flex min-h-0 w-[460px] shrink-0 flex-col border-l border-ui-border-base bg-ui-bg-base">
      <div className="border-b border-ui-border-base px-4 py-3">
        <div className="flex items-start justify-between gap-x-3">
          <div className="min-w-0">
            <Heading level="h2" className="!text-base truncate">
              {payload.title}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-muted">
              {payload.draft_type} · {payload.utc_offset ?? "UTC+7"}
            </Text>
          </div>
          <Button size="small" variant="transparent" onClick={onClose}>
            Hide
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge color={payload.status === "executed" ? "green" : payload.status === "approval_required" ? "orange" : payload.status === "error" ? "red" : "blue"}>
            {payload.status}
          </Badge>
          <Badge color={riskColor(payload.risk)}>{payload.risk}</Badge>
          <Badge>{payload.target_tool}</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {payload.description && (
          <div className="rounded-md border border-ui-border-base p-3">
            <Text size="small" className="whitespace-pre-wrap text-ui-fg-base">
              {payload.description}
            </Text>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Text size="small" weight="plus">Editable tool arguments</Text>
            <Text size="xsmall" className="text-ui-fg-muted">JSON</Text>
          </div>
          <Textarea
            value={argsText}
            onChange={(e: any) => setArgsText(e.target.value)}
            className="min-h-[260px] font-mono text-xs"
            disabled={busy || payload.status === "executed" || payload.status === "dismissed"}
          />
          {error && (
            <Text size="xsmall" className="text-ui-tag-red-text">
              {error}
            </Text>
          )}
        </div>
        {payload.execution_result !== undefined && (
          <div className="rounded-md border border-ui-border-base p-3">
            <Text size="small" weight="plus" className="mb-2">Execution result</Text>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-ui-fg-subtle">
              {compact(payload.execution_result, 4000)}
            </pre>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-x-2 border-t border-ui-border-base px-4 py-3">
        <Button size="small" variant="danger" onClick={dismiss} disabled={busy || payload.status === "dismissed"}>
          Dismiss
        </Button>
        <div className="flex gap-x-2">
          <Button size="small" variant="secondary" onClick={save} disabled={busy || payload.status === "executed" || payload.status === "dismissed"}>
            Save draft
          </Button>
          <Button size="small" onClick={execute} disabled={busy || payload.status === "executed" || payload.status === "dismissed"}>
            Execute
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Panel: Drawers for Admin Tabs                                      */
/* ------------------------------------------------------------------ */

const AdminDrawer = ({
  tab,
  open,
  onClose,
  loadData,
  sessions, skills, approvals, auditLogs, jobs, memories, gateways, settings, health,
  memoryQuery, setMemoryQuery, memoryDraft, setMemoryDraft, searchMemory, addMemory,
  editingMemoryId, setEditingMemoryId, memoryEditDraft, setMemoryEditDraft,
  startMemoryEdit, saveMemoryEdit, deleteMemory, toggleMemoryDisabled,
  cronDraft, setCronDraft, createCronJob, decideApproval, reportTemplates,
  runReportTemplate, scheduleTemplate, autonomy, evalResult, evalRunning, runEvaluation,
}: {
  tab: TabId | null
  open: boolean
  onClose: () => void
  loadData: () => Promise<void>
  [key: string]: any
}) => {
  const title = {
    approvals: "Approvals", audit: "Audit Log", memory: "Memory",
    skills: "Skills", cron: "Cron Jobs", gateways: "Gateways", settings: "Settings",
    autonomy: "Autonomy", evals: "Evaluations",
  }[tab ?? ""] ?? ""

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{title}</Drawer.Title>
        </Drawer.Header>
        {/* min-h-0 + overflow-y-auto: Drawer.Body defaults to flex-1 only (no overflow),
            so long content (Cron/Memory/Settings) overflows without scrolling. */}
        <Drawer.Body className="min-h-0 space-y-4 overflow-y-auto px-4" data-kami-drawer-body>
          {tab === "approvals" && (
            <div className="space-y-2">
              {approvals?.length ? approvals.map((a: Row) => (
                <div key={a.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge>{a.tool}</Badge>
                    <Badge color={a.status === "pending" ? "orange" : a.status === "approved" ? "green" : "red"}>
                      {a.status}
                    </Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{compact(a.args)}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">{formatDate(a.requested_at)}</Text>
                  {a.status === "pending" && (
                    <div className="flex gap-x-2 mt-2">
                      <Button size="small" variant="secondary" onClick={() => decideApproval(a.id, "rejected")}>Reject</Button>
                      <Button size="small" onClick={() => decideApproval(a.id, "approved")}>Approve</Button>
                    </div>
                  )}
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No pending approvals</Text>}
            </div>
          )}

          {tab === "audit" && (
            <div className="space-y-2">
              {auditLogs?.length ? auditLogs.map((log: Row) => (
                <div key={log.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Badge color={riskColor(log.risk_level)}>{log.risk_level}</Badge>
                    <Badge>{log.actor ?? "kami"}</Badge>
                    <Text size="xsmall" weight="plus">{log.tool}</Text>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{log.result_summary ?? "-"}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">{formatDate(log.created_at)}</Text>
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No audit logs</Text>}
            </div>
          )}

          {tab === "memory" && (
            <div className="space-y-4">
              <div className="flex gap-x-2">
                <Input
                  placeholder="Search memories..."
                  value={memoryQuery}
                  onChange={(e: any) => setMemoryQuery(e.target.value)}
                  onKeyDown={(e: any) => e.key === "Enter" && searchMemory()}
                />
                <Button size="small" variant="secondary" onClick={searchMemory}>Search</Button>
              </div>
              <div className="border-t border-ui-border-base pt-3 space-y-2">
                <Text size="xsmall" weight="plus">Add memory</Text>
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={memoryDraft.type}
                  onChange={(e) => setMemoryDraft((d: any) => ({ ...d, type: e.target.value }))}>
                  {["factual", "preference", "goal", "instruction", "event"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={memoryDraft.category}
                  onChange={(e) => setMemoryDraft((d: any) => ({ ...d, category: e.target.value }))}>
                  {["preference", "shop_rule", "operational", "goal", "forbidden"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Textarea
                  value={memoryDraft.content}
                  onChange={(e: any) => setMemoryDraft((d: any) => ({ ...d, content: e.target.value }))}
                  placeholder="Remember that..."
                />
                <Button size="small" onClick={addMemory}>Store</Button>
              </div>
              <div className="space-y-2">
                {memories?.length ? memories.map((m: Row) => (
                  <div key={m.id} className="rounded-lg border border-ui-border-base p-3">
                    {editingMemoryId === m.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select className="h-8 rounded-md border border-ui-border-base px-2 text-sm"
                            value={memoryEditDraft.type}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, type: e.target.value }))}>
                            {["factual", "preference", "goal", "instruction", "event"].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <select className="h-8 rounded-md border border-ui-border-base px-2 text-sm"
                            value={memoryEditDraft.category}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, category: e.target.value }))}>
                            {["preference", "shop_rule", "operational", "goal", "forbidden"].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <Textarea
                          value={memoryEditDraft.content}
                          onChange={(e: any) => setMemoryEditDraft((d: any) => ({ ...d, content: e.target.value }))}
                        />
                        <label className="flex items-center gap-x-2 text-xs text-ui-fg-subtle">
                          <input
                            type="checkbox"
                            checked={memoryEditDraft.disabled}
                            onChange={(e) => setMemoryEditDraft((d: any) => ({ ...d, disabled: e.target.checked }))}
                          />
                          Disabled
                        </label>
                        <div className="flex justify-end gap-x-2">
                          <Button size="small" variant="secondary" onClick={() => setEditingMemoryId(null)}>Cancel</Button>
                          <Button size="small" onClick={saveMemoryEdit}>Save</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-x-2 mb-1">
                          <Badge>{getMemoryCategory(m)}</Badge>
                          <Badge color={isMemoryDisabled(m) ? "grey" : "green"}>{isMemoryDisabled(m) ? "disabled" : "active"}</Badge>
                          <Text size="xsmall" className="text-ui-fg-muted">importance {m.importance ?? 1}</Text>
                        </div>
                        <Text size="small" className="whitespace-pre-wrap">{m.content}</Text>
                        <div className="mt-2 flex justify-end gap-x-1.5">
                          <Button size="small" variant="transparent" onClick={() => startMemoryEdit(m)}>Edit</Button>
                          <Button size="small" variant="transparent" onClick={() => toggleMemoryDisabled(m)}>
                            {isMemoryDisabled(m) ? "Enable" : "Disable"}
                          </Button>
                          <Button size="small" variant="danger" onClick={() => deleteMemory(m)}>Delete</Button>
                        </div>
                      </>
                    )}
                  </div>
                )) : <Text size="small" className="text-ui-fg-subtle">No memories</Text>}
              </div>
            </div>
          )}

          {tab === "skills" && (
            <div className="space-y-2">
              {skills?.length ? skills.map((s: Row) => (
                <div key={s.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Text size="small" weight="plus">{s.name}</Text>
                    <Badge>{s.category ?? "-"}</Badge>
                    <Badge>{s.origin ?? "human"}</Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{s.description ?? "-"}</Text>
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No skills</Text>}
            </div>
          )}

          {tab === "cron" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Text size="xsmall" weight="plus">Report templates</Text>
                {reportTemplates?.length ? reportTemplates.map((template: Row) => (
                  <div key={template.id} className="rounded-lg border border-ui-border-base p-3">
                    <div className="flex items-start justify-between gap-x-3">
                      <div className="min-w-0">
                        <Text size="small" weight="plus" className="truncate">{template.title}</Text>
                        <Text size="xsmall" className="line-clamp-2 text-ui-fg-subtle">{template.description}</Text>
                      </div>
                      <Badge>{template.category ?? "general"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      <Button size="small" variant="secondary" onClick={() => runReportTemplate(template)}>Run</Button>
                      {(template.schedule_presets?.length ? template.schedule_presets : [{ label: "Every morning 8:00", schedule: "0 8 * * *" }]).slice(0, 2).map((preset: Row) => (
                        <Button key={preset.label} size="small" variant="transparent" onClick={() => scheduleTemplate(template, preset)}>
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )) : <Text size="small" className="text-ui-fg-subtle">No report templates</Text>}
              </div>

              <div className="border rounded-lg border-ui-border-base p-3 space-y-3">
                <Text size="xsmall" weight="plus">Create job</Text>
                <Input placeholder="Job name" value={cronDraft.name}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, name: e.target.value }))} />
                <Textarea placeholder="Prompt KAMI should run..." value={cronDraft.prompt}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, prompt: e.target.value }))} />
                <Input placeholder="Schedule (e.g. @daily)" value={cronDraft.schedule}
                  onChange={(e: any) => setCronDraft((d: any) => ({ ...d, schedule: e.target.value }))} />
                <select className="w-full h-8 rounded-md border border-ui-border-base px-2 text-sm"
                  value={cronDraft.deliver}
                  onChange={(e) => setCronDraft((d: any) => ({ ...d, deliver: e.target.value }))}>
                  <option value="audit">Audit only</option>
                  <option value="session">Session</option>
                </select>
                <Button size="small" onClick={createCronJob}>Create</Button>
              </div>
              {jobs?.length ? jobs.map((j: Row) => (
                <div key={j.id} className="rounded-lg border border-ui-border-base p-3">
                  <div className="flex items-center gap-x-2 mb-1">
                    <Text size="small" weight="plus">{j.name}</Text>
                    <Badge>{j.enabled ? "active" : "paused"}</Badge>
                  </div>
                  <Text size="xsmall" className="text-ui-fg-subtle">{j.metadata?.schedule_label ?? j.schedule}</Text>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Next: {formatDate(j.next_run_at)} · Last: {formatDate(j.last_run_at)}
                  </Text>
                  {j.metadata?.run_history?.length > 0 && (
                    <div className="mt-2 rounded-md bg-ui-bg-subtle p-2">
                      <Text size="xsmall" weight="plus" className="mb-1">Run history</Text>
                      {j.metadata.run_history.slice(0, 3).map((run: Row, index: number) => (
                        <div key={index} className="flex items-center justify-between gap-x-2">
                          <Text size="xsmall" className="text-ui-fg-subtle">{formatDate(run.run_at)}</Text>
                          <Text size="xsmall" className="text-ui-fg-muted">{run.status}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">No scheduled jobs</Text>}
            </div>
          )}

          {tab === "gateways" && (
            <div className="space-y-2">
              {gateways?.length ? gateways.map((gw: Row) => (
                <div key={gw.id} className="rounded-lg border border-ui-border-base p-3 flex items-center justify-between">
                  <div>
                    <Text size="small" weight="plus">{gw.label}</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle"><code>{gw.webhook_path}</code></Text>
                  </div>
                  <Badge color={gw.configured ? "green" : "grey"} size="small">
                    {gw.configured ? "configured" : "not configured"}
                  </Badge>
                </div>
              )) : (
                <div className="space-y-2">
                  <Text size="small" className="text-ui-fg-subtle">No gateways configured. Set env vars and restart.</Text>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text size="small" weight="plus">Telegram</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">Set KAMI_GATEWAY_TELEGRAM_TOKEN</Text>
                  </div>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <Text size="small" weight="plus">Discord</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">Set KAMI_GATEWAY_DISCORD_TOKEN + KAMI_GATEWAY_DISCORD_PUBLIC_KEY</Text>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div className="space-y-3">
              {settings && Object.entries(settings)
                .filter(([k]) => !["model", "primary_model", "fallback_model", "fallbackModel", "baseUrl"].includes(k))
                .map(([k, v]) => (
                <div key={k} className="rounded-lg border border-ui-border-base p-3">
                  <Text size="small" weight="plus">{k}</Text>
                  <Text size="small" className="break-words text-ui-fg-subtle">{compact(String(v), 180)}</Text>
                </div>
              ))}
              {health && (
                <div className="rounded-lg border border-ui-border-base p-3">
                  <Text size="small" weight="plus">Provider Health</Text>
                  <Badge color={health.healthy ? "green" : "red"}>{health.healthy ? "healthy" : "unhealthy"}</Badge>
                </div>
              )}
            </div>
          )}

          {tab === "autonomy" && (
            <div className="space-y-3">
              {autonomy ? (
                <>
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <div className="mb-1 flex items-center justify-between gap-x-2">
                      <Text size="small" weight="plus">Mode</Text>
                      <Badge>{autonomy.mode}</Badge>
                    </div>
                    <Text size="small" className="text-ui-fg-subtle">{autonomy.description}</Text>
                    <Text size="xsmall" className="mt-2 text-ui-fg-muted">
                      Max mutations per turn: {autonomy.max_mutations_per_turn}
                    </Text>
                  </div>
                  <div className="space-y-2">
                    {(autonomy.policies ?? []).map((policy: Row) => (
                      <div key={policy.risk} className="rounded-lg border border-ui-border-base p-3">
                        <div className="flex items-center justify-between gap-x-2">
                          <Text size="small" weight="plus">{policy.risk}</Text>
                          <Badge color={policy.approval_required ? "orange" : "green"}>
                            {policy.approval_required ? "approval" : "direct"}
                          </Badge>
                        </div>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          Direct execution: {policy.direct ? "yes" : "no"}
                        </Text>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">Autonomy policy is not loaded.</Text>
              )}
            </div>
          )}

          {tab === "evals" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-ui-border-base p-3">
                <div className="flex items-start justify-between gap-x-3">
                  <div>
                    <Text size="small" weight="plus">Deterministic Harness</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Registry, report artifacts, quick actions, and autonomy policy.
                    </Text>
                  </div>
                  <Button size="small" variant="secondary" disabled={evalRunning} onClick={runEvaluation}>
                    {evalRunning ? "Running" : "Run"}
                  </Button>
                </div>
              </div>
              {evalResult ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-ui-border-base p-3">
                    <div className="flex items-center justify-between gap-x-2">
                      <Text size="small" weight="plus">Result</Text>
                      <Badge color={evalResult.totals?.failed ? "red" : "green"}>
                        {evalResult.totals?.passed ?? 0}/{evalResult.totals?.checks ?? 0} passed
                      </Badge>
                    </div>
                    <Text size="xsmall" className="text-ui-fg-muted">{formatDate(evalResult.generated_at)}</Text>
                  </div>
                  {(evalResult.checks ?? []).map((item: Row) => (
                    <div key={item.id} className="rounded-lg border border-ui-border-base p-3">
                      <div className="flex items-center justify-between gap-x-2">
                        <Text size="xsmall" weight="plus">{item.id}</Text>
                        <Badge color={item.passed ? "green" : "red"}>
                          {item.passed ? "pass" : "fail"}
                        </Badge>
                      </div>
                      <Text size="xsmall" className="break-words text-ui-fg-subtle">{compact(item.details, 220)}</Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">No evaluation run yet.</Text>
              )}
            </div>
          )}
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const KamiPage = () => {
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const [prompt, setPrompt] = useState("")
  const [sessionId, setSessionId] = useState<string | undefined>()
  // Messages are stored PER SESSION so a background generation in one session
  // never bleeds into whatever session the user is currently viewing. The
  // rendered `messages` below is derived from the currently-viewed bucket.
  // A brand-new chat (no id yet) uses the "pending" key until the server
  // assigns a real session id, at which point the bucket is migrated.
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({})
  const [sessions, setSessions] = useState<Row[]>([])
  const [sessionFilter, setSessionFilter] = useState("")
  const [drawerTab, setDrawerTab] = useState<TabId | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [sessionTagFilter, setSessionTagFilter] = useState("")
  const [sessionCategoryFilter, setSessionCategoryFilter] = useState("")
  const [showArchivedSessions, setShowArchivedSessions] = useState(false)
  const [runningSessions, setRunningSessions] = useState<Set<string>>(new Set())

  // Admin data
  const [skills, setSkills] = useState<Row[]>([])
  const [approvals, setApprovals] = useState<Row[]>([])
  const [auditLogs, setAuditLogs] = useState<Row[]>([])
  const [jobs, setJobs] = useState<Row[]>([])
  const [memories, setMemories] = useState<Row[]>([])
  const [memoryQuery, setMemoryQuery] = useState("")
  const [memoryDraft, setMemoryDraft] = useState({ content: "", type: "factual", category: "preference" })
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [memoryEditDraft, setMemoryEditDraft] = useState({ content: "", type: "factual", category: "preference", disabled: false })
  const [cronDraft, setCronDraft] = useState({ name: "", prompt: "", schedule: "", deliver: "audit", template_id: "" })
  const [settings, setSettings] = useState<Row | null>(null)
  const [health, setHealth] = useState<Row | null>(null)
  const [gateways, setGateways] = useState<Row[]>([])
  const [reports, setReports] = useState<Row[]>([])
  const [activeReport, setActiveReport] = useState<Row | null>(null)
  const [drafts, setDrafts] = useState<Row[]>([])
  const [activeDraft, setActiveDraft] = useState<Row | null>(null)
  const [activeCommand, setActiveCommand] = useState<UiCommand | null>(null)
  const [reportTemplates, setReportTemplates] = useState<Row[]>([])
  const [dashboardSuggestions, setDashboardSuggestions] = useState<Row[]>([])
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [autonomy, setAutonomy] = useState<Row | null>(null)
  const [evalResult, setEvalResult] = useState<Row | null>(null)
  const [evalRunning, setEvalRunning] = useState(false)
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [voiceLoopActive, setVoiceLoopActive] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState("")
  const [voiceInterim, setVoiceInterim] = useState("")

  // Scroll
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceStateRef = useRef<VoiceState>("idle")
  const voiceLoopActiveRef = useRef(false)
  const voiceStopReasonRef = useRef<"segment" | "empty" | "cancel">("segment")
  const voiceCaptureRef = useRef<Row | null>(null)
  const voiceSpeakingRef = useRef<SpeechSynthesisUtterance | null>(null)
  const realtimeVoiceRef = useRef<Row | null>(null)
  const runningSessionRef = useRef<string | null>(null)

  // Messages for the currently-viewed session. A new chat (no id yet) reads
  // from the "pending" bucket. Everything renders off this derived value, so
  // switching sessions instantly shows that session's own conversation.
  const viewKey = sessionId ?? "pending"
  const messages = messagesBySession[viewKey] ?? EMPTY_MESSAGES

  // Running state is derived per-session from `runningSessions`, never a single
  // global flag. Switching to a non-running session shows no spinner even while
  // another session generates in the background.
  const isRunning = runningSessions.has(viewKey)

  // Update the message list for a specific session (defaults to the running
  // session so background deltas land in the right bucket regardless of which
  // session the user is currently viewing).
  const updateSessionMessages = useCallback(
    (key: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setMessagesBySession((prev) => ({
        ...prev,
        [key]: updater(prev[key] ?? []),
      }))
    },
    []
  )

  const setVoiceStateValue = (state: VoiceState) => {
    voiceStateRef.current = state
    setVoiceState(state)
  }

  const filteredSessions = useMemo(() => {
    const q = sessionFilter.toLowerCase()
    return sessions.filter((s) => {
      const metadata = getSessionMeta(s)
      const tags = getSessionTags(s)

      if (!showArchivedSessions && metadata.archived) return false
      if (sessionTagFilter && !tags.includes(sessionTagFilter)) return false
      if (sessionCategoryFilter && metadata.category !== sessionCategoryFilter) return false
      if (q && !(s.title ?? "").toLowerCase().includes(q)) return false

      return true
    })
  }, [sessions, sessionFilter, sessionTagFilter, sessionCategoryFilter, showArchivedSessions])

  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "pending"),
    [approvals]
  )

  /* ---- Data loading ---- */

  const loadData = async () => {
    const [sData, skData, aData, audData, jData, mData, setData, hData, gData, tData, sugData, autonomyData] = await Promise.all([
      getJson<{ sessions: Row[] }>(`/admin/kami/sessions?limit=100&archived=${showArchivedSessions ? "all" : "false"}`),
      getJson<{ skills: Row[] }>("/admin/kami/skills?limit=20"),
      getJson<{ approvals: Row[] }>("/admin/kami/approvals?limit=20"),
      getJson<{ audit_logs: Row[] }>("/admin/kami/audit?limit=20"),
      getJson<{ jobs: Row[] }>("/admin/kami/cron?limit=20"),
      getJson<{ memories: Row[] }>("/admin/kami/memory?limit=20"),
      getJson<{ settings: Row }>("/admin/kami/settings"),
      getJson<{ health: Row }>("/admin/kami/health"),
      getJson<{ gateways: Row[] }>("/admin/kami/gateways"),
      getJson<{ templates: Row[] }>("/admin/kami/report-templates?limit=50"),
      getJson<{ suggestions: Row[] }>("/admin/kami/dashboard-suggestions"),
      getJson<{ autonomy: Row }>("/admin/kami/autonomy"),
    ])
    setSessions(sData.sessions ?? [])
    setSkills(skData.skills ?? [])
    setApprovals(aData.approvals ?? [])
    setAuditLogs(audData.audit_logs ?? [])
    setJobs(jData.jobs ?? [])
    setMemories(mData.memories ?? [])
    setSettings(setData.settings ?? null)
    setHealth(hData.health ?? null)
    setGateways(gData?.gateways ?? [])
    setReportTemplates(tData.templates ?? [])
    setDashboardSuggestions(sugData.suggestions ?? [])
    setAutonomy(autonomyData.autonomy ?? null)

    // Poll for sessions with active background generations
    try {
      const sessions = sData.sessions ?? []
      const statusPromises = sessions.slice(0, 30).map(async (s: Row) => {
        try {
          const r = await fetch(`/admin/kami/chat/stream-status/${s.id}`)
          if (!r.ok) return null
          const status = await r.json()
          return status.active ? s.id : null
        } catch {
          return null
        }
      })
      const results = await Promise.all(statusPromises)
      const activeIds = results.filter(Boolean) as string[]
      setRunningSessions((prev) => {
        // Server poll is authoritative for background generations (including
        // ones started in another tab). Union with any still-in-flight local
        // markers the server hasn't registered yet: the current turn's bucket
        // (runningSessionRef) and a not-yet-assigned "pending" chat.
        const next = new Set(activeIds)
        const localRunning = runningSessionRef.current
        if (localRunning) next.add(localRunning)
        if (prev.has("pending")) next.add("pending")
        return next
      })
    } catch {
      // Non-critical — best effort only
    }
  }

  useEffect(() => { loadData().catch((e) => toast.error(e.message)) }, [showArchivedSessions])

  const loadVoiceConfig = async () => {
    const data = await getJson<{ asr: VoiceConfig }>("/admin/kami/asr/config")
    setVoiceConfig(data.asr)
    if (!data.asr.enabled) {
      setVoiceStatus(data.asr.realtime?.error || "OPENAI_API_KEY is not configured")
      return
    }
    if (!data.asr.realtime?.enabled && data.asr.realtime?.error) {
      setVoiceStatus(data.asr.realtime.error)
    }
  }

  useEffect(() => {
    loadVoiceConfig().catch((e) => {
      setVoiceStatus(e instanceof Error ? e.message : String(e))
    })
  }, [])

  const searchSessions = async () => {
    const params = new URLSearchParams()
    params.set("limit", "100")
    params.set("archived", showArchivedSessions ? "all" : "false")
    if (sessionFilter.trim()) params.set("q", sessionFilter.trim())
    if (sessionTagFilter) params.set("tag", sessionTagFilter)
    if (sessionCategoryFilter) params.set("category", sessionCategoryFilter)

    const data = await getJson<{ sessions: Row[] }>(`/admin/kami/sessions?${params.toString()}`)
    setSessions(data.sessions ?? [])
  }

  const loadReports = async (id?: string) => {
    if (!id) {
      setReports([])
      setActiveReport(null)
      return
    }

    const data = await getJson<{ reports: Row[] }>(`/admin/kami/reports?session_id=${encodeURIComponent(id)}&limit=20`)
    const nextReports = (data.reports ?? []).filter((report) => report.type !== "draft")
    setReports(nextReports)
    setActiveReport(nextReports[0] ?? null)
  }

  const loadDrafts = async (id?: string) => {
    if (!id) {
      setDrafts([])
      setActiveDraft(null)
      return
    }

    const data = await getJson<{ drafts: Row[] }>(`/admin/kami/drafts?session_id=${encodeURIComponent(id)}&limit=20`)
    const nextDrafts = data.drafts ?? []
    const firstPendingDraft = nextDrafts.find((draft) => draft.payload?.status === "pending") ?? null
    setDrafts(nextDrafts)
    setActiveDraft((current) => {
      if (!current) return firstPendingDraft
      return nextDrafts.find((draft) => draft.id === current.id) ?? firstPendingDraft
    })
  }

  useEffect(() => {
    loadReports(sessionId).catch(() => {})
    loadDrafts(sessionId).catch(() => {})
  }, [sessionId])

  useEffect(() => { injectStyles() }, [])

  // Auto-close sidebar on mobile after switching sessions
  useEffect(() => {
    if (isMobile && sidebarOpen && sessionId) {
      setSidebarOpen(false)
    }
  }, [sessionId, isMobile])

  // Sync sidebar with mobile state
  useEffect(() => {
    if (!isMobile) setSidebarOpen(true)
  }, [isMobile])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const setHeight = () => {
      const top = root.getBoundingClientRect().top
      const height = Math.max(360, window.innerHeight - top - 1)
      root.style.setProperty("--kami-viewport-height", `${height}px`)
    }

    setHeight()
    const frame = window.requestAnimationFrame(setHeight)
    window.addEventListener("resize", setHeight)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", setHeight)
    }
  }, [])

  useEffect(() => {
    const ctx = new URLSearchParams(window.location.search).get("context")
    if (ctx) setPrompt(`Inspect record ${ctx}`)
  }, [])

  /* ---- Auto-scroll ---- */

  const scrollToBottom = (smooth = true) => {
    const el = scrollContainerRef.current

    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" })
    }

    setShowScrollBtn(false)
  }

  useEffect(() => {
    if (!isRunning) return

    const frame = window.requestAnimationFrame(() => scrollToBottom(false))
    return () => window.cancelAnimationFrame(frame)
  }, [messages, isRunning])

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(dist > 120)
  }

  /* ---- Session ---- */

  const loadSessionMessages = async (id: string) => {
    try {
      const data = await getJson<{ messages: Row[] }>(`/admin/kami/sessions/${id}/messages?limit=200`)
      const msgs = (data.messages ?? []).map((m: Row): ChatMessage => ({
        role: m.role,
        content: m.content ?? "",
        tool_calls: m.tool_calls ?? undefined,
        content_parts: m.content_parts ?? undefined,
        metadata: m.metadata ?? undefined,
        created_at: m.created_at ?? undefined,
      }))
      setSessionId(id)
      // Don't clobber a bucket that THIS tab is actively streaming into — the
      // live deltas are more current than the persisted messages. If there's no
      // local bucket yet (e.g. the generation is running elsewhere, or finished
      // while we were away), seed from the server.
      const seeded = mergeToolMessages(msgs)
      setMessagesBySession((prev) => {
        const hasLiveBucket = runningSessions.has(id) && prev[id]?.length
        if (hasLiveBucket) return prev
        return { ...prev, [id]: seeded }
      })
      await Promise.all([loadReports(id), loadDrafts(id)])
      setTimeout(() => scrollToBottom(false), 100)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const newChat = () => {
    setSessionId(undefined)
    // Clear only the "pending" bucket (a fresh new chat). Other sessions'
    // messages stay intact so their background generations keep accumulating.
    setMessagesBySession((prev) => {
      if (prev["pending"] === undefined) return prev
      const next = { ...prev }
      delete next["pending"]
      return next
    })
    setPrompt("")
    setReports([])
    setActiveReport(null)
    setDrafts([])
    setActiveDraft(null)
    setActiveCommand(null)
  }

  const startRenameSession = (session: Row) => {
    setRenamingSessionId(session.id)
    setRenameDraft(session.title ?? "Untitled")
  }

  const cancelRenameSession = () => {
    setRenamingSessionId(null)
    setRenameDraft("")
  }

  const saveRenameSession = async () => {
    if (!renamingSessionId) return

    const title = renameDraft.trim()
    if (!title) {
      toast.error("Session title is required")
      return
    }

    try {
      const data = await patchJson<{ session: Row }>(
        `/admin/kami/sessions/${renamingSessionId}`,
        { title }
      )
      setSessions((prev) =>
        prev.map((session) =>
          session.id === renamingSessionId ? { ...session, ...data.session } : session
        )
      )
      cancelRenameSession()
      toast.success("Session renamed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteSession = async (session: Row) => {
    const confirmed = window.confirm(`Delete session "${session.title ?? "Untitled"}"?`)
    if (!confirmed) return

    setDeletingSessionId(session.id)
    try {
      await deleteJson(`/admin/kami/sessions/${session.id}`)
      setSessions((prev) => prev.filter((item) => item.id !== session.id))
      if (session.id === sessionId) {
        newChat()
      }
      toast.success("Session deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingSessionId(null)
    }
  }

  const updateSessionMeta = async (session: Row, patch: Row) => {
    const data = await patchJson<{ session: Row }>(
      `/admin/kami/sessions/${session.id}`,
      patch
    )
    setSessions((prev) =>
      prev.map((item) => item.id === session.id ? { ...item, ...data.session } : item)
    )
    return data.session
  }

  const togglePinSession = async (session: Row) => {
    await updateSessionMeta(session, { pinned: !getSessionMeta(session).pinned })
  }

  const toggleArchiveSession = async (session: Row) => {
    await updateSessionMeta(session, { archived: !getSessionMeta(session).archived })
    if (session.id === sessionId && !getSessionMeta(session).archived) {
      newChat()
    }
  }

  const tagSession = async (session: Row, tag: string) => {
    const tags = new Set(getSessionTags(session))
    if (tags.has(tag)) {
      tags.delete(tag)
    } else {
      tags.add(tag)
    }
    await updateSessionMeta(session, { tags: [...tags], category: tag === "report" ? "report" : getSessionMeta(session).category ?? "chat" })
  }

  /* ---- Chat ---- */

  const applyUiCommand = (command: UiCommand) => {
    if (command.action === "open_drawer") {
      const tab = command.tab ?? command.panel
      if (["approvals", "audit", "memory", "skills", "cron", "gateways", "settings", "autonomy", "evals"].includes(String(tab))) {
        setDrawerTab(tab as TabId)
      }
      setActiveCommand(null)
      return
    }

    if (command.action === "open_artifact" && command.artifact_id) {
      const report = reports.find((item) => item.id === command.artifact_id)
      if (report) {
        setActiveReport(report)
        setActiveDraft(null)
        setActiveCommand(null)
        return
      }
    }

    if (command.action === "open_draft" && command.draft_id) {
      const draft = drafts.find((item) => item.id === command.draft_id)
      if (draft) {
        setActiveDraft(draft)
        setActiveReport(null)
        setActiveCommand(null)
        return
      }
    }

    if (command.panel === "report" && reports[0]) {
      setActiveReport(reports[0])
      setActiveDraft(null)
      setActiveCommand(null)
      return
    }

    if (command.panel === "draft" && drafts[0]) {
      setActiveDraft(drafts[0])
      setActiveReport(null)
      setActiveCommand(null)
      return
    }

    setActiveCommand(command)
    setActiveReport(null)
    setActiveDraft(null)
  }

  const saveDraft = async (draft: Row, args: Row) => {
    const data = await patchJson<{ draft: Row }>(`/admin/kami/drafts/${draft.id}`, { args })
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? data.draft : item))
    setActiveDraft(data.draft)
    toast.success("Draft saved")
    return data.draft
  }

  const executeDraft = async (draft: Row, args: Row) => {
    const data = await postJson<Row>(`/admin/kami/drafts/${draft.id}/execute`, { args })
    const updatedDraft = data.draft
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? updatedDraft : item))
    setActiveDraft(updatedDraft)

    if (data.artifact) {
      setActiveReport(data.artifact)
      setActiveDraft(null)
      setReports((prev) => [data.artifact, ...prev.filter((report) => report.id !== data.artifact.id)])
    }

    const resultText = typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2)
    updateSessionMessages(sessionId ?? "pending", (prev) => [
      ...prev,
      {
        role: "assistant",
        content: `${draft.payload?.title ?? "Draft"} executed.`,
        content_parts: [{ type: "text", text: `${draft.payload?.title ?? "Draft"} executed.` }],
        metadata: {
          quick_actions: data.quick_actions ?? [],
          artifact_id: data.artifact?.id ?? null,
        },
        created_at: new Date().toISOString(),
      },
      {
        role: "tool",
        content: resultText,
        content_parts: [{
          type: "tool_call",
          tool_name: data.tool ?? draft.payload?.target_tool,
          args,
          result: data.result,
          risk: data.risk,
        }],
        created_at: new Date().toISOString(),
      },
    ])
    toast.success("Draft executed")
    await loadData()
  }

  const dismissDraft = async (draft: Row) => {
    const data = await deleteJson<{ draft: Row }>(`/admin/kami/drafts/${draft.id}`)
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? data.draft : item))
    setActiveDraft(null)
    toast.success("Draft dismissed")
  }

  const sendMessage = async (options?: { text?: string; session_id?: string; hideBubble?: boolean }): Promise<string> => {
    const text = (options?.text ?? prompt).trim()
    // hideBubble sends the full text to the backend (so the AI gets context)
    // without pushing a user bubble. Quick-action follow-ups use this: the
    // visible user bubble + tool card are already rendered by runQuickAction,
    // so the follow-up turn only needs to stream the assistant's analysis.
    const hideBubble = options?.hideBubble ?? false
    const targetSessionId = options?.session_id ?? sessionId
    // Block only if the SAME session is already generating — a background
    // generation in another session must never block this one.
    const alreadyRunning =
      runningSessions.has(targetSessionId || "pending")
    if (!text || alreadyRunning) return ""
    if (!options?.text) {
      setPrompt("")
    }
    const now = new Date().toISOString()

    // Every message this turn writes to a FIXED bucket key, decoupled from the
    // currently-viewed session. If the user switches away mid-generation, the
    // deltas keep landing in this bucket instead of the session they navigated
    // to. Starts as "pending" for a brand-new chat and is migrated to the real
    // session id once the server assigns one (see the "session" event below).
    let bucketKey = targetSessionId || "pending"
    runningSessionRef.current = bucketKey
    setRunningSessions((prev) => new Set(prev).add(bucketKey))

    updateSessionMessages(bucketKey, (prev) => [
      ...prev,
      ...(hideBubble
        ? []
        : [{ role: "user" as const, content: text, created_at: now }]),
      {
        role: "assistant",
        content: "",
        content_parts: [],
        metadata: { pending: true },
        created_at: now,
      },
    ])

    try {
      const r = await fetch("/admin/kami/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: targetSessionId, message: text, toolset: "admin" }),
      })
      if (!r.ok || !r.body) throw new Error(`${r.status} ${r.statusText}`)

      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let asstText = ""
      let asstReasoning = ""
      let finalAssistantText = ""
      let asstParts: ContentPart[] = []
      let currentArtifactId: string | null = null
      let currentQuickActions: QuickAction[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const blocks = buf.split("\n\n")
        buf = blocks.pop() ?? ""

        for (const block of blocks) {
          const evt = parseSseBlock(block)
          if (!evt) continue

          if (evt.type === "session") {
            setSessionId((current) => current ?? evt.session_id)
            setSessions((prev) => {
              if (prev.some((session) => session.id === evt.session_id)) return prev

              return [
                {
                  id: evt.session_id,
                  title: text.slice(0, 60) || "New Chat",
                  message_count: 1,
                  created_at: now,
                  updated_at: now,
                  metadata: { category: "chat", tags: [] },
                },
                ...prev,
              ]
            })
            // Migrate the "pending" bucket to the real session id so the
            // in-flight messages follow the session, then keep writing there.
            if (bucketKey !== evt.session_id) {
              const oldKey = bucketKey
              bucketKey = evt.session_id
              setMessagesBySession((prev) => {
                if (prev[oldKey] === undefined) return prev
                const next = { ...prev }
                next[evt.session_id] = next[oldKey]
                if (oldKey === "pending") delete next[oldKey]
                return next
              })
            }
            runningSessionRef.current = evt.session_id
            setRunningSessions((prev) => {
              const next = new Set(prev)
              next.delete("pending")
              next.add(evt.session_id)
              return next
            })
          }

          if (evt.type === "text_delta") {
            asstText += evt.delta ?? ""
            asstParts = asstParts.filter((p) => p.type !== "text")
            asstParts.push({ type: "text", text: asstText })
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: asstText, content_parts: [...asstParts], metadata: { ...(last.metadata ?? {}), pending: false } }]
              }
              return [...prev, { role: "assistant", content: asstText, content_parts: [...asstParts], created_at: new Date().toISOString() }]
            })
          }

          if (evt.type === "reasoning_delta") {
            asstReasoning += evt.delta ?? ""
            asstParts = asstParts.filter((p) => p.type !== "think")
            asstParts.unshift({ type: "think", think: asstReasoning })
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content_parts: [...asstParts], metadata: { ...(last.metadata ?? {}), pending: false } }]
              }
              return [...prev, { role: "assistant", content: "", content_parts: [...asstParts], created_at: new Date().toISOString() }]
            })
          }

          if (evt.type === "tool_start") {
            asstParts.push({ type: "tool_call", tool_name: evt.call?.name ?? "", args: evt.call?.arguments, risk: evt.risk })
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content_parts: [...asstParts], metadata: { ...(last.metadata ?? {}), pending: false } }]
              }
              return [...prev, { role: "assistant", content: "", content_parts: [...asstParts], created_at: new Date().toISOString() }]
            })
          }

          if (evt.type === "tool_result") {
            asstParts = updateToolResultParts(asstParts, evt.call, evt.result, evt.risk)
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content_parts: [...asstParts], metadata: { ...(last.metadata ?? {}), pending: false } }]
              }
              return prev
            })
          }

          if (evt.type === "trace_step") {
            const existing = asstParts.find((p) => p.type === "trace") as any
            const steps: TraceStep[] = existing?.steps ? [...existing.steps] : []
            const idx = steps.findIndex((step) => step.index === evt.step.index)
            if (idx === -1) {
              steps.push(evt.step)
            } else {
              steps[idx] = evt.step
            }
            steps.sort((a, b) => a.index - b.index)
            asstParts = asstParts.filter((p) => p.type !== "trace")
            asstParts.unshift({ type: "trace", steps })
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content_parts: [...asstParts], metadata: { ...(last.metadata ?? {}), pending: false } }]
              }
              return prev
            })
          }

          if (evt.type === "artifact_done") {
            currentArtifactId = evt.artifact_id
            const report = {
              id: evt.artifact_id,
              title: evt.payload?.title,
              payload: evt.payload,
              session_id: sessionId,
              created_at: new Date().toISOString(),
            }
            setActiveReport(report)
            setActiveDraft(null)
            setActiveCommand(null)
            setReports((prev) => [report, ...prev.filter((item) => item.id !== report.id)])
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, metadata: { ...(last.metadata ?? {}), artifact_id: currentArtifactId, pending: false } }]
              }
              return prev
            })
          }

          if (evt.type === "quick_actions") {
            currentQuickActions = evt.actions ?? []
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, metadata: { ...(last.metadata ?? {}), quick_actions: currentQuickActions, pending: false } }]
              }
              return prev
            })
          }

          if (evt.type === "dashboard_suggestions") {
            setDashboardSuggestions(evt.suggestions ?? [])
          }

          if (evt.type === "draft_created") {
            const draft = evt.artifact ?? {
              id: evt.artifact_id,
              title: evt.draft?.title,
              payload: evt.draft,
              session_id: sessionId,
              type: "draft",
              created_at: new Date().toISOString(),
            }
            setActiveDraft(draft)
            setActiveReport(null)
            setActiveCommand(null)
            setDrafts((prev) => [draft, ...prev.filter((item) => item.id !== draft.id)])
          }

          if (evt.type === "ui_command" && evt.command) {
            applyUiCommand(evt.command)
          }

          if (evt.type === "approval_required") {
            const appMsg: ChatMessage = {
              role: "tool",
              content: `Approval required for ${evt.call?.name ?? "unknown"}`,
              content_parts: [{ type: "error", error: `Approval required: ${evt.call?.name ?? "unknown"}. Check the Approvals panel.` }],
              created_at: new Date().toISOString(),
            }
            updateSessionMessages(bucketKey, (prev) => [...prev, appMsg])
            loadData().catch(() => {})
          }

          if (evt.type === "error") {
            const errMsg: ChatMessage = {
              role: "tool",
              content: `Error: ${evt.message}`,
              content_parts: [{ type: "error", error: evt.message ?? "Unknown error" }],
              created_at: new Date().toISOString(),
            }
            updateSessionMessages(bucketKey, (prev) => [...prev, errMsg])
          }

          if (evt.type === "done") {
            finalAssistantText = asstText
            // Finalize the assistant message
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), {
                  ...last,
                  content_parts: [...asstParts],
                  metadata: {
                    ...(last.metadata ?? {}),
                    artifact_id: currentArtifactId,
                    quick_actions: currentQuickActions,
                    pending: false,
                  },
                }]
              }
              return prev
            })
            asstText = ""
            asstReasoning = ""
            asstParts = []
          }
        }
      }
      await loadData()
      return (finalAssistantText || asstText).trim()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error(message)
      updateSessionMessages(bucketKey, (prev) => {
        const last = prev[prev.length - 1]

        if (last?.role === "assistant" && !last.content && !(last.content_parts?.length)) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content_parts: [{ type: "error", error: message }],
              metadata: { ...(last.metadata ?? {}), pending: false },
            },
          ]
        }

        return prev
      })
      return ""
    } finally {
      // Clear the running flag for THIS turn's bucket only. `bucketKey` is a
      // closure-local (already migrated to the real session id above), so
      // concurrent generations in other sessions are never affected — unlike
      // the shared runningSessionRef, which a second turn would clobber.
      if (runningSessionRef.current === bucketKey) {
        runningSessionRef.current = null
      }
      setRunningSessions((prev) => {
        if (!prev.has(bucketKey) && !prev.has("pending")) return prev
        const next = new Set(prev)
        next.delete("pending")
        next.delete(bucketKey)
        return next
      })
    }
  }

  const halt = async () => {
    await postJson("/admin/kami/halt", { session_id: sessionId })
    toast.success("Halt signal sent")
  }

  const decideApproval = async (id: string, status: "approved" | "rejected") => {
    await postJson(`/admin/kami/approvals/${id}/decide`, { status })
    await loadData()
  }

  const addMemory = async () => {
    if (!memoryDraft.content.trim()) return
    await postJson("/admin/kami/memory", {
      content: memoryDraft.content.trim(),
      type: memoryDraft.type || "factual",
      category: memoryDraft.category || memoryDraft.type || "factual",
    })
    setMemoryDraft({ content: "", type: "factual", category: "preference" })
    await loadData()
    toast.success("Memory stored")
  }

  const searchMemory = async () => {
    if (!memoryQuery.trim()) { await loadData(); return }
    const data = await postJson<{ memories: Row[] }>("/admin/kami/memory/search", { query: memoryQuery.trim(), limit: 30 })
    setMemories(data.memories ?? [])
  }

  const startMemoryEdit = (memory: Row) => {
    setEditingMemoryId(memory.id)
    setMemoryEditDraft({
      content: memory.content ?? "",
      type: memory.type ?? "factual",
      category: getMemoryCategory(memory),
      disabled: isMemoryDisabled(memory),
    })
  }

  const saveMemoryEdit = async () => {
    if (!editingMemoryId) return
    await patchJson(`/admin/kami/memory/${editingMemoryId}`, memoryEditDraft)
    setEditingMemoryId(null)
    await loadData()
    toast.success("Memory updated")
  }

  const deleteMemory = async (memory: Row) => {
    const ok = window.confirm("Delete this memory?")
    if (!ok) return
    await deleteJson(`/admin/kami/memory/${memory.id}`)
    await loadData()
    toast.success("Memory deleted")
  }

  const toggleMemoryDisabled = async (memory: Row) => {
    await patchJson(`/admin/kami/memory/${memory.id}`, {
      disabled: !isMemoryDisabled(memory),
      category: getMemoryCategory(memory),
    })
    await loadData()
  }

  const createCronJob = async () => {
    if (!cronDraft.name.trim() || !cronDraft.prompt.trim() || !cronDraft.schedule.trim()) return
    await postJson("/admin/kami/cron", {
      name: cronDraft.name.trim(),
      prompt: cronDraft.prompt.trim(),
      schedule: cronDraft.schedule.trim(),
      deliver: cronDraft.deliver || "audit",
      template_id: cronDraft.template_id || null,
      enabled: true,
    })
    setCronDraft({ name: "", prompt: "", schedule: "", deliver: "audit", template_id: "" })
    await loadData()
    toast.success("Cron job created")
  }

  const runEvaluation = async () => {
    setEvalRunning(true)
    try {
      const data = await postJson<Row>("/admin/kami/evals", {})
      setEvalResult(data.result ?? data)
      toast.success("Evaluation completed")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEvalRunning(false)
    }
  }

  const runQuickAction = async (action: QuickAction) => {
    // Hybrid approach: execute the tool directly (guaranteed, no reliance on
    // AI interpretation), then trigger an AI follow-up turn so it can analyze
    // the result and suggest next steps intelligently.
    //
    // Why not just sendMessage(action.label)?
    //   The AI receives plain text and just responds conversationally ("Export
    //   CSV completed.") without actually calling any tool. The tool MUST run
    //   directly first.
    //
    // Why not just POST /admin/kami/actions alone?
    //   The tool runs but the AI never sees the result. User gets a static
    //   "completed" with no analysis or follow-up.
    const key = `${action.tool}-${action.label}`
    setRunningAction(key)
    try {
      // ── Step 1: Execute the tool directly (guaranteed execution) ──
      const data = await postJson<Row>("/admin/kami/actions", {
        ...action,
        session_id: action.session_id ?? sessionId,
      })

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id)
      }

      if (data.artifact) {
        setActiveReport(data.artifact)
        setReports((prev) => [data.artifact, ...prev.filter((report) => report.id !== data.artifact.id)])
      }

      // ── Step 2: Show the execution in chat ──
      const resultText = typeof data.result === "string"
        ? data.result
        : JSON.stringify(data.result, null, 2)

      const actionKey = data.session_id ?? action.session_id ?? sessionId ?? "pending"
      updateSessionMessages(actionKey, (prev) => [
        ...prev,
        {
          role: "user" as const,
          content: action.label,
          created_at: new Date().toISOString(),
        },
        {
          role: "tool" as const,
          content: resultText.slice(0, 2000),
          content_parts: [{
            type: "tool_call" as const,
            tool_name: action.tool,
            args: action.args,
            result: data.result,
            risk: data.risk ?? "safe",
          }],
          created_at: new Date().toISOString(),
        },
      ])

      // ── Step 3: Trigger AI follow-up turn ──
      // The backend does NOT persist the quick-action result to session
      // history, so the follow-up prompt must carry the raw result itself for
      // the AI to have context. hideBubble keeps that JSON-carrying prompt out
      // of the visible chat — the clean user bubble + tool card from Step 2
      // already show the user what ran, so the follow-up only streams the
      // assistant's analysis.
      await sendMessage({
        hideBubble: true,
        session_id: data.session_id ?? sessionId,
        text: `Người dùng vừa chạy hành động "${action.label}". Kết quả của công cụ \`${action.tool}\`:\n\n\`\`\`json\n${resultText.slice(0, 4000)}\n\`\`\`\n\nHãy phân tích kết quả này, cho biết đã xử lý được những gì, và đề xuất các bước tiếp theo nếu cần.`,
      })

      await loadData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRunningAction(null)
    }
  }

  const runReportTemplate = async (template: Row) => {
    const data = await postJson<{ session: Row; message: string }>(
      `/admin/kami/report-templates/${template.id}/run`,
      {}
    )
    setSessionId(data.session.id)
    setSessions((prev) => [data.session, ...prev.filter((session) => session.id !== data.session.id)])
    await sendMessage({ text: data.message, session_id: data.session.id })
  }

  const scheduleTemplate = (template: Row, preset?: Row) => {
    setDrawerTab("cron")
    setCronDraft({
      name: template.title ?? template.name,
      prompt: template.prompt,
      schedule: preset?.schedule ?? template.schedule_presets?.[0]?.schedule ?? "0 8 * * *",
      deliver: "session",
      template_id: template.id,
    })
  }

  const insertTranscript = (text: string) => {
    setPrompt((current) => appendTranscript(current, text))
  }

  const cleanupVoiceRecording = () => {
    const capture = voiceCaptureRef.current
    if (capture?.raf) {
      window.cancelAnimationFrame(capture.raf)
    }
    capture?.source?.disconnect?.()
    capture?.analyser?.disconnect?.()
    capture?.audioContext?.close?.()
    capture?.stream?.getTracks?.().forEach((track: MediaStreamTrack) => track.stop())
    voiceCaptureRef.current = null
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
    voiceStreamRef.current = null
    voiceRecorderRef.current = null
  }

  const stopVoiceCapture = (reason: "segment" | "empty" | "cancel") => {
    voiceStopReasonRef.current = reason
    const recorder = voiceRecorderRef.current

    if (recorder?.state === "recording" || recorder?.state === "paused") {
      recorder.stop()
      return
    }

    cleanupVoiceRecording()
  }

  const speakAssistantReply = async (text: string) => {
    const speechText = cleanSpeechText(text)
    if (!speechText || !voiceLoopActiveRef.current) return

    const synth = window.speechSynthesis
    if (!synth) {
      setVoiceStatus("Speech playback is not supported")
      return
    }

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(speechText)
      const lang = detectSpeechLanguage(speechText)
      const voices = synth.getVoices?.() ?? []
      const normalized = lang.toLowerCase()
      const base = normalized.split("-")[0]
      const voice =
        voices.find((item) => item.lang.toLowerCase() === normalized) ??
        voices.find((item) => item.lang.toLowerCase().startsWith(base)) ??
        null

      utterance.lang = lang
      utterance.rate = 1
      utterance.pitch = 1
      if (voice) utterance.voice = voice

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        if (voiceSpeakingRef.current === utterance) {
          voiceSpeakingRef.current = null
        }
        resolve()
      }

      utterance.onend = finish
      utterance.onerror = finish
      voiceSpeakingRef.current = utterance
      setVoiceStateValue("speaking")
      setVoiceStatus("Speaking")
      synth.cancel()
      synth.speak(utterance)
    })
  }

  const scheduleNextVoiceCapture = (delay = 350) => {
    window.setTimeout(() => {
      if (!voiceLoopActiveRef.current || voiceStateRef.current !== "idle") return
      startVoiceCapture().catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        setVoiceStatus(message)
        toast.error(message)
        setVoiceLoopActive(false)
        voiceLoopActiveRef.current = false
        setVoiceStateValue("idle")
      })
    }, delay)
  }

  const handleVoiceSegment = async (chunks: Blob[], mimeType: string) => {
    if (!chunks.length || !voiceLoopActiveRef.current) {
      setVoiceStateValue("idle")
      scheduleNextVoiceCapture()
      return
    }

    try {
      setVoiceStateValue("transcribing")
      setVoiceStatus("Transcribing")
      const blob = new Blob(chunks, { type: mimeType })
      const audioBase64 = await blobToBase64(blob)
      const data = await postJson<{
        text: string
        detected_language?: string | null
        confidence?: number | null
      }>("/admin/kami/asr/transcribe", {
        audio_base64: audioBase64,
        mime_type: mimeType,
      })

      const transcript = data.text?.trim()
      if (!transcript) {
        setVoiceStatus("No speech detected")
        return
      }

      setVoiceInterim(transcript)
      setVoiceStateValue("sending")
      setVoiceStatus("Sending to KAMI")
      const reply = await sendMessage({ text: transcript, session_id: sessionId })

      if (reply && voiceLoopActiveRef.current) {
        await speakAssistantReply(reply)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setVoiceStatus(message)
      toast.error(message)
    } finally {
      setVoiceInterim("")
      setVoiceStateValue("idle")
      if (voiceLoopActiveRef.current) {
        setVoiceStatus("Listening")
        scheduleNextVoiceCapture()
      }
    }
  }

  const monitorVoiceSilence = (
    analyser: AnalyserNode,
    recorder: MediaRecorder,
    startedAt: number
  ) => {
    const data = new Uint8Array(analyser.fftSize)
    let heardSpeech = false
    let lastVoiceAt = 0
    const threshold = 0.025
    const silenceMs = 1100
    const noSpeechMs = 9000
    const maxMs = 30000

    const tick = () => {
      if (!voiceLoopActiveRef.current || recorder.state !== "recording") return

      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (const value of data) {
        const normalized = (value - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / data.length)
      const now = Date.now()

      if (rms > threshold) {
        heardSpeech = true
        lastVoiceAt = now
      }

      if (heardSpeech && now - lastVoiceAt > silenceMs) {
        stopVoiceCapture("segment")
        return
      }

      if (!heardSpeech && now - startedAt > noSpeechMs) {
        stopVoiceCapture("empty")
        return
      }

      if (now - startedAt > maxMs) {
        stopVoiceCapture("segment")
        return
      }

      if (voiceCaptureRef.current) {
        voiceCaptureRef.current.raf = window.requestAnimationFrame(tick)
      }
    }

    tick()
  }

  const checkVoiceCapabilities = (): string | null => {
    // Check secure context (HTTPS or localhost required for getUserMedia)
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "Voice requires HTTPS. This page is loaded over an insecure connection."
    }
    // Check MediaRecorder (required for send mode)
    if (typeof MediaRecorder === "undefined") {
      return "MediaRecorder is not supported in this browser. Try Chrome, Edge, or Safari 14+."
    }
    // Check getUserMedia (required for microphone)
    if (!navigator.mediaDevices?.getUserMedia) {
      return "Microphone access is not available. Ensure the page is served over HTTPS and your browser supports getUserMedia."
    }
    // Check AudioContext
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) {
      return "AudioContext is not supported in this browser."
    }
    return null
  }

  const startVoiceCapture = async () => {
    if (!voiceConfig?.modes?.send) {
      toast.error("ASR is not enabled")
      setVoiceLoopActive(false)
      voiceLoopActiveRef.current = false
      return
    }
    const capError = checkVoiceCapabilities()
    if (capError) {
      toast.error(capError)
      setVoiceLoopActive(false)
      voiceLoopActiveRef.current = false
      return
    }
    if (!voiceLoopActiveRef.current || voiceRecorderRef.current) return

    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) {
      toast.error("AudioContext is not supported in this browser")
      setVoiceLoopActive(false)
      voiceLoopActiveRef.current = false
      return
    }

    try {
      setVoiceInterim("")
      setVoiceStatus("Listening")
      setVoiceStateValue("recording")
      voiceChunksRef.current = []
      voiceStopReasonRef.current = "segment"

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const mimeType = getBestSupportedAudioMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      const audioContext = new AudioContextCtor()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()

      analyser.fftSize = 1024
      source.connect(analyser)

      voiceStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceCaptureRef.current = { audioContext, source, analyser, stream }

      recorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data?.size) {
          voiceChunksRef.current.push(event.data)
        }
      })

      recorder.addEventListener("stop", async () => {
        const chunks = [...voiceChunksRef.current]
        const reason = voiceStopReasonRef.current
        voiceChunksRef.current = []
        cleanupVoiceRecording()

        if (reason === "cancel" || !voiceLoopActiveRef.current) {
          setVoiceStateValue("idle")
          setVoiceStatus("Voice stopped")
          return
        }

        if (reason === "empty" || !chunks.length) {
          setVoiceStateValue("idle")
          setVoiceStatus("Listening")
          scheduleNextVoiceCapture(250)
          return
        }

        await handleVoiceSegment(chunks, mimeType)
      })

      recorder.start(250)
      monitorVoiceSilence(analyser, recorder, Date.now())
    } catch (e) {
      cleanupVoiceRecording()
      setVoiceStateValue("idle")
      setVoiceLoopActive(false)
      voiceLoopActiveRef.current = false
      const message = e instanceof Error ? e.message : String(e)
      setVoiceStatus(message)
      toast.error(message)
    }
  }

  const startVoiceSend = async () => {
    if (voiceLoopActiveRef.current) return
    setVoiceLoopActive(true)
    voiceLoopActiveRef.current = true
    await startVoiceCapture()
  }

  const stopVoiceSend = () => {
    setVoiceLoopActive(false)
    voiceLoopActiveRef.current = false
    window.speechSynthesis?.cancel?.()
    voiceSpeakingRef.current = null
    stopVoiceCapture("cancel")
    if (voiceStateRef.current !== "recording") {
      setVoiceStateValue("idle")
      setVoiceStatus("Voice stopped")
    }
  }

  const stopRealtimeVoice = () => {
    const refs = realtimeVoiceRef.current
    if (!refs) {
      setVoiceStateValue("idle")
      return
    }

    try {
      if (refs.ws?.readyState === WebSocket.OPEN) {
        refs.ws.send("CloseStream")
        refs.ws.close()
      }
      refs.processor?.disconnect?.()
      refs.source?.disconnect?.()
      refs.gain?.disconnect?.()
      refs.audioContext?.close?.()
      refs.stream?.getTracks?.().forEach((track: MediaStreamTrack) => track.stop())
    } finally {
      realtimeVoiceRef.current = null
      setVoiceInterim("")
      setVoiceStatus("Realtime stopped")
      setVoiceStateValue("idle")
    }
  }

  const startRealtimeVoice = async () => {
    if (!voiceConfig?.modes?.realtime) {
      toast.error(voiceConfig?.realtime?.error || "Realtime ASR is not enabled")
      return
    }
    const capError = checkVoiceCapabilities()
    if (capError) {
      toast.error(capError)
      return
    }
    if (voiceState !== "idle") return

    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext

    try {
      setVoiceInterim("")
      setVoiceStatus("Connecting")
      setVoiceStateValue("connecting")

      const ticket = await postJson<{
        ticket: string
        ws_url: string
        sample_rate?: number
      }>("/admin/kami/asr/realtime-ticket", {})
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const audioContext = new AudioContextCtor()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const gain = audioContext.createGain()
      const sampleRate = ticket.sample_rate || voiceConfig.sample_rate || 24000
      const ws = new WebSocket(
        `${ticket.ws_url}?ticket=${encodeURIComponent(ticket.ticket)}`
      )

      gain.gain.value = 0

      processor.onaudioprocess = (event: any) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const input = event.inputBuffer.getChannelData(0)
        ws.send(linear16FromFloat32(input, audioContext.sampleRate, sampleRate))
      }

      ws.onopen = () => {
        source.connect(processor)
        processor.connect(gain)
        gain.connect(audioContext.destination)
        setVoiceStatus("Realtime listening")
        setVoiceStateValue("live")
      }

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data))
          if (payload.type === "Error" || payload.type === "error") {
            throw new Error(payload.message ?? "Realtime ASR error")
          }

          const { transcript, isFinal } = extractRealtimeTranscript(payload)
          if (!transcript) return

          if (isFinal) {
            insertTranscript(transcript)
            setVoiceInterim("")
          } else {
            setVoiceInterim(transcript)
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          setVoiceStatus(message)
          toast.error(message)
        }
      }

      ws.onerror = () => {
        setVoiceStatus("Realtime connection error")
        toast.error("Realtime connection error")
      }

      ws.onclose = () => {
        if (realtimeVoiceRef.current?.ws === ws) {
          stopRealtimeVoice()
        }
      }

      realtimeVoiceRef.current = { ws, stream, audioContext, source, processor, gain }
    } catch (e) {
      stopRealtimeVoice()
      const message = e instanceof Error ? e.message : String(e)
      setVoiceStatus(message)
      toast.error(message)
    }
  }

  useEffect(() => {
    return () => {
      voiceLoopActiveRef.current = false
      window.speechSynthesis?.cancel?.()
      cleanupVoiceRecording()
      stopRealtimeVoice()
    }
  }, [])

  const handleComposerKeyDown = (e: any) => {
    const isComposing =
      e.isComposing ||
      e.nativeEvent?.isComposing ||
      e.key === "Process" ||
      e.keyCode === 229

    if (e.key !== "Enter" || e.shiftKey || isComposing) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    sendMessage()
  }

  /* ---- Render ---- */

  return (
    <TooltipProvider>
      <div
        ref={rootRef}
        data-kami-root
        className="relative flex min-h-0 flex-col overflow-hidden bg-ui-bg-base"
        style={{ height: "var(--kami-viewport-height, 100vh)", maxHeight: "var(--kami-viewport-height, 100vh)" }}
      >
        {/* Top bar */}
        <div className="kami-topbar flex items-center justify-between border-b border-ui-border-base px-4 py-2 shrink-0">
          <div className="kami-topbar-left flex items-center gap-x-3">
            {/* Hamburger on mobile, Sessions on desktop */}
            <Button
              size="small"
              variant="transparent"
              className="kami-hamburger-btn"
              style={isMobile ? {} : { display: "none" }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </Button>
            <Button
              size="small"
              variant="transparent"
              className="kami-topbar-desktop-btn"
              style={isMobile ? { display: "none" } : {}}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? "Hide sessions" : "Sessions"}
            </Button>
            <div className="flex items-center gap-x-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-ui-tag-purple-bg">
                <Text size="small" weight="plus" className="text-ui-tag-purple-text">K</Text>
              </div>
              <div>
                <Heading level="h2" className="!text-base">KAMI</Heading>
              </div>
            </div>
            {isRunning && <Badge size="2xsmall" color="purple">generating</Badge>}
          </div>

          <div className="kami-topbar-right flex items-center gap-x-1.5">
            {/* Essential buttons always visible */}
            <Tooltip content="Approvals">
              <Button size="small" variant="transparent" onClick={() => { setDrawerTab("approvals"); setMobileMenuOpen(false) }} className="kami-touch-btn">
                {pendingApprovals.length > 0 ? `${pendingApprovals.length}⚠` : "Appr"}
              </Button>
            </Tooltip>
            <Tooltip content="Reports">
              <Button
                size="small"
                variant="transparent"
                className="kami-touch-btn"
                disabled={reports.length === 0}
                onClick={() => {
                  setActiveReport(reports[0])
                  setActiveDraft(null)
                  setActiveCommand(null)
                }}
              >
                Rpt{reports.length > 0 ? `(${reports.length})` : ""}
              </Button>
            </Tooltip>
            <Tooltip content="Drafts">
              <Button
                size="small"
                variant="transparent"
                className="kami-touch-btn"
                disabled={drafts.length === 0}
                onClick={() => {
                  setActiveDraft(drafts.find((draft) => draft.payload?.status === "pending") ?? drafts[0])
                  setActiveReport(null)
                  setActiveCommand(null)
                }}
              >
                Drft{drafts.length > 0 ? `(${drafts.length})` : ""}
              </Button>
            </Tooltip>

            {/* Desktop-only tab buttons */}
            <Tooltip content="Audit Log"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("audit")}>Audit</Button></Tooltip>
            <Tooltip content="Memory"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("memory")}>Memory</Button></Tooltip>
            <Tooltip content="Skills"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("skills")}>Skills</Button></Tooltip>
            <Tooltip content="Cron"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("cron")}>Cron</Button></Tooltip>
            <Tooltip content="Gateways"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("gateways")}>Gateways</Button></Tooltip>
            <Tooltip content="Autonomy"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("autonomy")}>Autonomy</Button></Tooltip>
            <Tooltip content="Evaluations"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("evals")}>Evals</Button></Tooltip>
            <Tooltip content="Settings"><Button size="small" variant="transparent" className="kami-topbar-desktop-btn" onClick={() => setDrawerTab("settings")}>Settings</Button></Tooltip>

            {/* "More" dropdown on mobile */}
            {isMobile && (
              <DropdownMenu>
                <Tooltip content="More">
                  <DropdownMenu.Trigger asChild>
                    <Button size="small" variant="transparent" className="kami-touch-btn">•••</Button>
                  </DropdownMenu.Trigger>
                </Tooltip>
                <DropdownMenu.Content align="end" className="min-w-[160px]">
                  <DropdownMenu.Item onSelect={() => setDrawerTab("audit")}>Audit Log</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("memory")}>Memory</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("skills")}>Skills</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("cron")}>Cron Jobs</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("gateways")}>Gateways</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("autonomy")}>Autonomy</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("evals")}>Evaluations</DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => setDrawerTab("settings")}>Settings</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            )}

            <div className="w-px h-5 bg-ui-border-base mx-1" />

            <Button size="small" variant="secondary" onClick={loadData} className="kami-touch-btn">↻</Button>
            <Button size="small" variant="danger" onClick={halt} className="kami-touch-btn">■</Button>
          </div>
        </div>

        {/* Main: Sidebar + Chat */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Session Sidebar — mobile overlay + desktop inline */}
          {(isMobile ? mobileMenuOpen : sidebarOpen) && (
            <>
              {isMobile && <div className="kami-sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />}
              <div
                className={isMobile
                  ? "kami-sidebar-panel kami-slide-in-left flex min-h-0 flex-col border-r border-ui-border-base bg-ui-bg-subtle"
                  : "flex min-h-0 w-[260px] shrink-0 flex-col border-r border-ui-border-base bg-ui-bg-subtle"}
                onClick={isMobile ? (e: any) => e.stopPropagation() : undefined}
              >
              <div className="p-3 space-y-2 border-b border-ui-border-base">
                <Button
                  size="small"
                  variant={sessionId ? "secondary" : "primary"}
                  className="w-full"
                  onClick={newChat}
                >
                  New Chat
                </Button>
                <div className="relative">
                  <input
                    className="w-full h-7 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-xs text-ui-fg-base placeholder:text-ui-fg-muted"
                    placeholder="Search sessions..."
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        searchSessions().catch((err) => toast.error(err.message))
                      }
                    }}
                  />
                  {sessionFilter && (
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ui-fg-muted"
                      onClick={() => {
                        setSessionFilter("")
                        setTimeout(() => loadData().catch((err) => toast.error(err.message)), 0)
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <select
                    className="h-7 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-xs text-ui-fg-base"
                    value={sessionCategoryFilter}
                    onChange={(e) => {
                      setSessionCategoryFilter(e.target.value)
                      setTimeout(() => searchSessions().catch((err) => toast.error(err.message)), 0)
                    }}
                  >
                    <option value="">All types</option>
                    {["chat", "report", "action", "scheduled", "gateway"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <select
                    className="h-7 rounded-md border border-ui-border-base bg-ui-bg-field px-2 text-xs text-ui-fg-base"
                    value={sessionTagFilter}
                    onChange={(e) => {
                      setSessionTagFilter(e.target.value)
                      setTimeout(() => searchSessions().catch((err) => toast.error(err.message)), 0)
                    }}
                  >
                    <option value="">All tags</option>
                    {["report", "action", "error", "customer", "order", "product"].map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-x-2 text-xs text-ui-fg-subtle">
                  <input
                    type="checkbox"
                    checked={showArchivedSessions}
                    onChange={(e) => setShowArchivedSessions(e.target.checked)}
                  />
                  Show archived
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredSessions.length ? filteredSessions.map((s) => {
                  const isRenaming = renamingSessionId === s.id
                  const isDeleting = deletingSessionId === s.id
                  const metadata = getSessionMeta(s)
                  const tags = getSessionTags(s)
                  const sessionIsRunning = runningSessions.has(s.id)

                  return (
                    <div
                      key={s.id}
                      className={`border-b border-ui-border-base px-3 py-2.5 transition-colors group ${s.id === sessionId ? "bg-ui-bg-base border-l-2 border-l-ui-fg-interactive" : "hover:bg-ui-bg-base-hover"}`}
                    >
                      {isRenaming ? (
                        <div className="space-y-2">
                          <input
                            className="w-full h-8 rounded-md border border-ui-border-interactive bg-ui-bg-field px-2 text-xs text-ui-fg-base outline-none"
                            value={renameDraft}
                            autoFocus
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                saveRenameSession()
                              }
                              if (e.key === "Escape") {
                                e.preventDefault()
                                cancelRenameSession()
                              }
                            }}
                          />
                          <div className="flex items-center justify-end gap-x-1.5">
                            <button
                              className="rounded-md px-2 py-1 text-xs text-ui-fg-subtle hover:bg-ui-bg-base-hover"
                              onClick={cancelRenameSession}
                            >
                              Cancel
                            </button>
                            <button
                              className="rounded-md bg-ui-button-neutral px-2 py-1 text-xs text-ui-fg-on-color hover:bg-ui-button-neutral-hover"
                              onClick={saveRenameSession}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            className="w-full text-left"
                            onClick={() => loadSessionMessages(s.id)}
                          >
                            <div className="flex items-center gap-x-1.5">
                              {metadata.pinned && <Badge size="2xsmall" color="blue">pin</Badge>}
                              {sessionIsRunning && (
                                <span
                                  className="kami-spinner"
                                  data-kami-session-running="true"
                                  aria-label="KAMI is responding"
                                  title="KAMI is responding"
                                />
                              )}
                              <Text size="small" className="truncate text-ui-fg-base">{s.title ?? "Untitled"}</Text>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <Text size="xsmall" className="text-ui-fg-muted">
                                {s.message_count ?? 0} msg{Number(s.message_count) !== 1 ? "s" : ""}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-muted">
                                {relativeTime(s.created_at)}
                              </Text>
                            </div>
                            {tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag) => (
                                  <span key={tag} className="rounded bg-ui-bg-subtle px-1.5 py-0.5 text-[10px] text-ui-fg-muted">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                          <div className="mt-2 flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <DropdownMenu>
                              <Tooltip content="Edit session">
                                <DropdownMenu.Trigger asChild>
                                  <IconButton
                                    size="small"
                                    variant="transparent"
                                    type="button"
                                    aria-label="Edit session"
                                  >
                                    <PencilSquare />
                                  </IconButton>
                                </DropdownMenu.Trigger>
                              </Tooltip>
                              <DropdownMenu.Content align="end" className="min-w-[160px]">
                                <DropdownMenu.Item onSelect={() => togglePinSession(s)}>
                                  {metadata.pinned ? "Unpin" : "Pin"}
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onSelect={() => tagSession(s, "report")}>
                                  Report
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onSelect={() => startRenameSession(s)}>
                                  Rename
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onSelect={() => toggleArchiveSession(s)}>
                                  {metadata.archived ? "Restore" : "Archive"}
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item
                                  disabled={isDeleting}
                                  className="text-ui-tag-red-text focus:text-ui-tag-red-text"
                                  onSelect={(event: any) => {
                                    event.preventDefault()
                                    deleteSession(s)
                                  }}
                                >
                                  {isDeleting ? "Deleting" : "Delete"}
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu>
                          </div>
                        </>
                      )}
                    </div>
                  )
                }) : (
                  <div className="p-4 text-center">
                    <Text size="small" className="text-ui-fg-subtle">
                      {sessionFilter ? "No matching sessions" : "No sessions yet"}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

          {/* Chat Area */}
          <div className="kami-chat-area relative flex min-h-0 flex-1 flex-col overflow-hidden min-w-0">
            {/* Messages */}
            <div
              ref={scrollContainerRef}
              className="kami-messages-area min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3"
              onScroll={handleScroll}
            >
              {messages.length ? (
                <>
                  {messages.map((msg, i) => (
                    <ChatMessageBubble
                      key={`${msg.role}-${i}`}
                      msg={msg}
                      isStreaming={isRunning && i === messages.length - 1 && msg.role === "assistant"}
                      onQuickAction={runQuickAction}
                    />
                  ))}
                  <div ref={messagesEndRef} className="h-0" />
                </>
              ) : (
                /* Empty / Welcome state */
                <div className="kami-welcome flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-ui-tag-purple-bg mb-4">
                    <Text size="large" weight="plus" className="text-ui-tag-purple-text !text-2xl">K</Text>
                  </div>
                  <Heading level="h2" className="!text-lg mb-1">Ask KAMI anything</Heading>
                  <Text size="small" className="text-ui-fg-subtle mb-6 max-w-md">
                    KAMI has full access to your Medusa store — products, orders, customers, inventory, and more.
                  </Text>
                  <div className="kami-welcome-suggestions flex flex-wrap justify-center gap-2 max-w-lg">
	                    {(dashboardSuggestions.length ? dashboardSuggestions : [
	                      { label: "Sales report", prompt: "Create a sales report for today with revenue, orders, customers, and inventory risk.", tool: "commerce_dashboard", args: { days: 1, low_stock_threshold: 5 }, risk: "read" },
	                      { label: "Recent orders", prompt: "Show recent orders and highlight anything that needs action.", tool: "operations_risk_report", args: { low_stock_threshold: 5 }, risk: "read" },
	                      { label: "Low stock", prompt: "Create a low-stock report and suggest restock priorities.", tool: "inventory_report", args: { low_stock_threshold: 5 }, risk: "read" },
	                      { label: "Customers", prompt: "Create a customer insight report.", tool: "customer_retention_report", args: { days: 90 }, risk: "read" },
	                      { label: "Product catalog", prompt: "Create a product catalog health report.", tool: "product_opportunity_report", args: { days: 90 }, risk: "read" },
	                    ]).map((suggestion: Row) => (
	                      <button
	                        key={suggestion.label}
	                        className="rounded-full border border-ui-border-base px-3.5 py-1.5 text-xs text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base transition-colors"
	                        onClick={() => {
	                          if (suggestion.tool) {
	                            runQuickAction({
	                              label: suggestion.label,
	                              description: suggestion.description ?? suggestion.prompt,
	                              kind: suggestion.kind ?? "report",
	                              tool: suggestion.tool,
	                              args: suggestion.args ?? {},
	                              risk: suggestion.risk ?? "read",
	                              confirm_required: suggestion.confirm_required ?? false,
	                              session_id: suggestion.session_id ?? sessionId,
	                            }).catch((err) => toast.error(err.message))
	                            return
	                          }
	                          setPrompt(suggestion.prompt ?? suggestion.label)
	                        }}
	                      >
	                        {suggestion.label}
	                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Scroll-to-bottom button */}
            {showScrollBtn && (
              <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-10">
                <Button
                  variant="primary"
                  size="small"
                  className="rounded-full shadow-lg"
                  onClick={() => scrollToBottom(true)}
                >
                  Latest
                </Button>
              </div>
            )}

            {/* Input area */}
            <div className="kami-input-area shrink-0 border-t border-ui-border-base px-4 py-3">
              <div className="max-w-3xl mx-auto">
                <div
                  className={`kami-input-composer rounded-xl border bg-ui-bg-base shadow-sm transition-colors focus-within:border-ui-border-interactive ${prompt ? "border-ui-border-interactive" : "border-ui-border-base"}`}
                  onKeyDownCapture={handleComposerKeyDown}
                >
                  <textarea
                    id="kami-prompt-textarea"
                    className="block w-full resize-none border-0 bg-transparent px-3.5 py-3 text-sm leading-5 text-ui-fg-base outline-none placeholder:text-ui-fg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Message KAMI... (Enter to send, Shift+Enter for newline)"
                    value={prompt}
                    onChange={(e: any) => setPrompt(e.target.value)}
                    rows={2}
                    disabled={isRunning}
                  />
                  <div className="flex items-center justify-between border-t border-ui-border-base px-3 py-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {sessionId ? `Session ${sessionId.slice(0, 10)}...` : "New session"}
                      </Text>
                      {voiceConfig && (
                        <>
                          <Text size="xsmall" className="text-ui-fg-muted">
                            Auto language
                          </Text>
                          <button
                            type="button"
                            className="h-7 rounded-md border border-ui-border-base px-2 text-xs text-ui-fg-subtle transition-colors hover:bg-ui-bg-base-hover disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!voiceLoopActive && (!voiceConfig.modes.send || isRunning || voiceState !== "idle")}
                            onClick={voiceLoopActive ? stopVoiceSend : startVoiceSend}
                            title={!voiceConfig.modes.send ? voiceConfig.realtime?.error || "OPENAI_API_KEY is not configured" : undefined}
                          >
                            {voiceLoopActive ? "Stop voice" : "Voice send"}
                          </button>
                          <button
                            type="button"
                            className="h-7 rounded-md border border-ui-border-base px-2 text-xs text-ui-fg-subtle transition-colors hover:bg-ui-bg-base-hover disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={voiceLoopActive || isRunning || !voiceConfig.modes.realtime || (voiceState !== "idle" && voiceState !== "live")}
                            onClick={voiceState === "live" ? stopRealtimeVoice : startRealtimeVoice}
                            title={!voiceConfig.modes.realtime ? voiceConfig.realtime?.error || "OPENAI_API_KEY is not configured" : undefined}
                          >
                            {voiceState === "live" || voiceState === "connecting" ? "Stop realtime" : "Realtime"}
                          </button>
                          {(voiceInterim || voiceStatus) && (
                            <Text size="xsmall" className="flex max-w-[300px] items-center gap-x-1 truncate text-ui-fg-muted">
                              <span className="truncate">{voiceInterim || voiceStatus}</span>
                              {voiceLoopActive && voiceState === "recording" && (
                                <span className="flex shrink-0 gap-0.5">
                                  <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
                                  <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
                                  <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
                                </span>
                              )}
                            </Text>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-x-1.5">
                      {isRunning ? (
                        <Button size="small" variant="danger" onClick={halt}>
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => sendMessage()}
                          disabled={!prompt.trim()}
                        >
                          Send
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {activeDraft ? (
            <DraftPanel
              draft={activeDraft}
              onClose={() => setActiveDraft(null)}
              onSave={saveDraft}
              onExecute={executeDraft}
              onDismiss={dismissDraft}
            />
          ) : activeCommand ? (
            <UiCommandPanel
              command={activeCommand}
              onClose={() => setActiveCommand(null)}
            />
          ) : (
            <ArtifactPanel
              report={activeReport}
              onClose={() => setActiveReport(null)}
            />
          )}
        </div>

        {/* Admin Drawer */}
        <AdminDrawer
          tab={drawerTab}
          open={drawerTab !== null}
          onClose={() => setDrawerTab(null)}
          loadData={loadData}
          sessions={sessions} skills={skills} approvals={approvals}
          auditLogs={auditLogs} jobs={jobs} memories={memories}
          gateways={gateways} settings={settings} health={health}
          memoryQuery={memoryQuery} setMemoryQuery={setMemoryQuery}
          memoryDraft={memoryDraft} setMemoryDraft={setMemoryDraft}
          searchMemory={searchMemory} addMemory={addMemory}
          editingMemoryId={editingMemoryId} setEditingMemoryId={setEditingMemoryId}
          memoryEditDraft={memoryEditDraft} setMemoryEditDraft={setMemoryEditDraft}
          startMemoryEdit={startMemoryEdit} saveMemoryEdit={saveMemoryEdit}
          deleteMemory={deleteMemory} toggleMemoryDisabled={toggleMemoryDisabled}
          cronDraft={cronDraft} setCronDraft={setCronDraft}
          createCronJob={createCronJob} decideApproval={decideApproval}
          reportTemplates={reportTemplates}
          runReportTemplate={runReportTemplate}
          scheduleTemplate={scheduleTemplate}
          autonomy={autonomy}
          evalResult={evalResult}
          evalRunning={evalRunning}
          runEvaluation={runEvaluation}
        />
      </div>
    </TooltipProvider>
  )
}

export const config = defineRouteConfig({
  label: "KAMI",
  rank: 30,
})

export default KamiPage
