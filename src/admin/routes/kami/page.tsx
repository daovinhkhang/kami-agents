"use client"

import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  DropdownMenu,
  Heading,
  IconButton,
  Text,
  Tooltip,
  TooltipProvider,
  toast,
} from "@medusajs/ui"
import { CogSixTooth, PencilSquare, XMark } from "@medusajs/icons"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type {
  ChatMessage,
  ContentPart,
  QuickAction,
  Row,
  TabId,
  TraceStep,
  UiCommand,
  VoiceConfig,
  VoiceState,
} from "./types"
import { deleteJson, getJson, patchJson, postJson } from "./api"
import {
  appendTranscript,
  blobToBase64,
  cleanSpeechText,
  detectSpeechLanguage,
  EMPTY_MESSAGES,
  extractRealtimeTranscript,
  getBestSupportedAudioMimeType,
  getMemoryCategory,
  getSessionMeta,
  getSessionTags,
  isMemoryDisabled,
  linear16FromFloat32,
  mergeToolMessages,
  parseSseBlock,
  relativeTime,
  updateToolResultParts,
} from "./helpers"
import { injectStyles } from "./styles"
import { KamiLogo } from "./logo"
import { ChatMessageBubble } from "./message-components"
import { AdminDrawer } from "./admin-drawer"

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const KamiPage = () => {
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [moreToolsOpen, setMoreToolsOpen] = useState(false)

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
  const [drafts, setDrafts] = useState<Row[]>([])
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
      return
    }

    const data = await getJson<{ reports: Row[] }>(`/admin/kami/reports?session_id=${encodeURIComponent(id)}&limit=20`)
    const nextReports = (data.reports ?? []).filter((report) => report.type !== "draft")
    setReports(nextReports)
  }

  const loadDrafts = async (id?: string) => {
    if (!id) {
      setDrafts([])
      return
    }

    const data = await getJson<{ drafts: Row[] }>(`/admin/kami/drafts?session_id=${encodeURIComponent(id)}&limit=20`)
    setDrafts(data.drafts ?? [])
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
    setDrafts([])
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

  // Artifacts, drafts, and focus cards now render inline in the chat stream, so
  // the only ui_command that still drives navigation is open_drawer (which opens
  // an admin drawer tab). Everything else is emitted as an inline card by the
  // assistant turn and needs no imperative handling here.
  const applyUiCommand = (command: UiCommand) => {
    if (command.action === "open_drawer") {
      const tab = command.tab ?? command.panel
      if (["approvals", "audit", "memory", "skills", "cron", "gateways", "settings", "autonomy", "evals"].includes(String(tab))) {
        setDrawerTab(tab as TabId)
      }
    }
  }

  const saveDraft = async (draft: Row, args: Row) => {
    const data = await patchJson<{ draft: Row }>(`/admin/kami/drafts/${draft.id}`, { args })
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? data.draft : item))
    toast.success("Draft saved")
    return data.draft
  }

  const executeDraft = async (draft: Row, args: Row) => {
    const data = await postJson<Row>(`/admin/kami/drafts/${draft.id}/execute`, { args })
    const updatedDraft = data.draft
    setDrafts((prev) => prev.map((item) => item.id === draft.id ? updatedDraft : item))

    if (data.artifact) {
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
            // The report renders inline from the tool_call result. We keep it in
            // `reports` only so export links + loadReports stay consistent.
            const report = {
              id: evt.artifact_id,
              title: evt.payload?.title,
              payload: evt.payload,
              session_id: sessionId,
              created_at: new Date().toISOString(),
            }
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
            // The draft renders inline from its tool_call result. We keep it in
            // `drafts` only so the inline card's live status (save/execute)
            // stays consistent after reload.
            setDrafts((prev) => [draft, ...prev.filter((item) => item.id !== draft.id)])
          }

          if (evt.type === "ui_command" && evt.command) {
            applyUiCommand(evt.command)
          }

          if (evt.type === "approval_required") {
            // Render the approval gate inline in the chat stream (opencode-style)
            // instead of shunting the user off to a separate panel.
            const appMsg: ChatMessage = {
              role: "tool",
              content: `Approval required for ${evt.call?.name ?? "unknown"}`,
              content_parts: [{ type: "approval", approval: evt.approval as Row }],
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
            // Snapshot the accumulated parts BEFORE resetting the accumulators.
            // updateSessionMessages defers the updater to React's next render,
            // so a `[...asstParts]` read inside the closure would run AFTER the
            // reset below and capture an empty array — wiping the finalized text
            // and rich tool cards. Capture a stable value here instead.
            const finalParts = [...asstParts]
            const finalArtifactId = currentArtifactId
            const finalQuickActions = currentQuickActions
            updateSessionMessages(bucketKey, (prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), {
                  ...last,
                  content_parts: finalParts,
                  metadata: {
                    ...(last.metadata ?? {}),
                    artifact_id: finalArtifactId,
                    quick_actions: finalQuickActions,
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
    // Flip the inline approval card to its settled state right away, in every
    // session bucket that holds it — the blocked turn resumes server-side.
    const decided = status === "approved" ? "approved" as const : "rejected" as const
    setMessagesBySession((prev) => {
      let changed = false
      const next: Record<string, ChatMessage[]> = {}
      for (const [key, msgs] of Object.entries(prev)) {
        next[key] = msgs.map((msg) => {
          const parts = msg.content_parts
          if (!parts?.some((p) => p.type === "approval" && (p.approval as Row)?.id === id)) return msg
          changed = true
          return {
            ...msg,
            content_parts: parts.map((p) =>
              p.type === "approval" && (p.approval as Row)?.id === id ? { ...p, decided } : p
            ),
          }
        })
      }
      return changed ? next : prev
    })
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
        // If the action produced a report artifact, render it inline as a card
        // (the old panel path is gone). A synthetic render_artifact tool part is
        // the same shape RichToolCard renders from a normal turn.
        ...(data.artifact
          ? [{
              role: "tool" as const,
              content: "",
              content_parts: [{
                type: "tool_call" as const,
                tool_name: "render_artifact",
                args: {},
                result: { id: data.artifact.id, payload: data.artifact.payload },
                risk: "read",
              }],
              created_at: new Date().toISOString(),
            }]
          : []),
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
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-ui-bg-subtle">
                <KamiLogo className="size-8" />
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

            {/* Advanced tools — hidden behind a single gear that expands a
                horizontal strip. Keeps the topbar minimal for end users while
                power tools stay one tap away. */}
            {moreToolsOpen && (
              <div className="kami-more-strip" role="group" aria-label="Advanced tools">
                {([
                  ["audit", "Audit"],
                  ["memory", "Memory"],
                  ["skills", "Skills"],
                  ["cron", "Cron"],
                  ["gateways", "Gateways"],
                  ["autonomy", "Autonomy"],
                  ["evals", "Evals"],
                  ["settings", "Settings"],
                ] as [TabId, string][]).map(([tab, label]) => (
                  <Tooltip key={tab} content={label}>
                    <Button
                      size="small"
                      variant="transparent"
                      className="kami-touch-btn"
                      onClick={() => {
                        setDrawerTab(tab)
                        setMoreToolsOpen(false)
                        setMobileMenuOpen(false)
                      }}
                    >
                      {label}
                    </Button>
                  </Tooltip>
                ))}
              </div>
            )}
            <Tooltip content={moreToolsOpen ? "Close tools" : "More tools"}>
              <IconButton
                size="small"
                variant="transparent"
                className="kami-touch-btn"
                aria-label={moreToolsOpen ? "Close tools" : "More tools"}
                aria-expanded={moreToolsOpen}
                onClick={() => setMoreToolsOpen((open) => !open)}
              >
                {moreToolsOpen ? <XMark /> : <CogSixTooth />}
              </IconButton>
            </Tooltip>

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
                      drafts={drafts}
                      onSaveDraft={saveDraft}
                      onExecuteDraft={executeDraft}
                      onDismissDraft={dismissDraft}
                      onDecideApproval={decideApproval}
                    />
                  ))}
                  <div ref={messagesEndRef} className="h-0" />
                </>
              ) : (
                /* Empty / Welcome state */
                <div className="kami-welcome flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-ui-bg-subtle mb-4">
                    <KamiLogo className="size-20" />
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
