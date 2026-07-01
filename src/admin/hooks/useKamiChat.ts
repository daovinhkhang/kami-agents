/**
 * useKamiChat — Resumable SSE chat hook.
 *
 * Replaces the manual fetch+ReadableStream SSE parsing in page.tsx.
 * Supports auto-reconnect with exponential backoff and resume.
 *
 * Flow:
 *   1. POST /admin/kami/chat/start → { streamId, sessionId }
 *   2. GET /admin/kami/chat/stream/:streamId → SSE events
 *   3. On disconnect: reconnect with ?resume=true
 */

import { useCallback, useEffect, useRef, useState } from "react"

// ── Types ──

type KamiEvent =
  | { type: "session"; session_id: string }
  | { type: "text_delta"; delta: string }
  | { type: "reasoning_delta"; delta: string }
  | { type: "tool_start"; call: { id: string; name: string; arguments: Record<string, unknown> }; risk: string }
  | { type: "tool_result"; call: { id: string; name: string; arguments: Record<string, unknown> }; result: unknown }
  | { type: "trace_step"; step: { index: number; tool: string; status: string; label: string } }
  | { type: "artifact_delta"; artifact_id: string; section_index: number; delta: unknown }
  | { type: "artifact_done"; artifact_id: string; payload: Record<string, unknown> }
  | { type: "quick_actions"; actions: unknown[] }
  | { type: "approval_required"; approval: unknown; call: unknown }
  | { type: "draft_created"; artifact_id: string; draft: unknown; artifact: unknown }
  | { type: "ui_command"; command: unknown }
  | { type: "error"; message: string }
  | { type: "done"; text?: string; reason?: string }

export type ConnectionState = "idle" | "connecting" | "streaming" | "reconnecting" | "disconnected" | "completed" | "error"

export type ChatCallbacks = {
  onSession?: (sessionId: string) => void
  onTextDelta?: (delta: string) => void
  onReasoningDelta?: (delta: string) => void
  onToolStart?: (call: any, risk: string) => void
  onToolResult?: (call: any, result: unknown) => void
  onTraceStep?: (step: { index: number; tool: string; status: string; label: string }) => void
  onArtifactDelta?: (artifactId: string, sectionIndex: number, delta: unknown) => void
  onArtifactDone?: (artifactId: string, payload: Record<string, unknown>) => void
  onQuickActions?: (actions: unknown[]) => void
  onApprovalRequired?: (approval: unknown, call: unknown) => void
  onDraftCreated?: (artifactId: string, draft: unknown) => void
  onUiCommand?: (command: unknown) => void
  onDone?: (text?: string, reason?: string) => void
  onError?: (message: string) => void
  onConnectionStateChange?: (state: ConnectionState) => void
}

// ── Constants ──

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 16000
const SSE_LINE_REGEX = /^(event|data):\s*(.*)$/

// ── Hook ──

export function useKamiChat(callbacks: ChatCallbacks = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [streamId, setStreamId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const setState = useCallback((state: ConnectionState) => {
    setConnectionState(state)
    callbacksRef.current.onConnectionStateChange?.(state)
  }, [])

  const parseSseBlock = useCallback((block: string): KamiEvent | null => {
    let eventType = ""
    let data = ""

    for (const line of block.split("\n")) {
      const match = line.match(SSE_LINE_REGEX)
      if (!match) continue
      if (match[1] === "event") eventType = match[2]
      else if (match[1] === "data") data = match[2]
    }

    if (!data) return null

    try {
      const parsed = JSON.parse(data)
      if (eventType === "sync" || eventType === "sync_done") {
        // Resume markers — not actual events, but the data has replayed_count
        return { type: "text_delta", delta: "" } // skip silently
      }
      return { type: eventType || "text_delta", ...parsed } as KamiEvent
    } catch {
      return null
    }
  }, [])

  const processEvent = useCallback((event: KamiEvent) => {
    const cb = callbacksRef.current
    switch (event.type) {
      case "session":
        cb.onSession?.(event.session_id)
        break
      case "text_delta":
        cb.onTextDelta?.(event.delta)
        break
      case "reasoning_delta":
        cb.onReasoningDelta?.(event.delta)
        break
      case "tool_start":
        cb.onToolStart?.(event.call, event.risk)
        break
      case "tool_result":
        cb.onToolResult?.(event.call, event.result)
        break
      case "trace_step":
        cb.onTraceStep?.(event.step)
        break
      case "artifact_delta":
        cb.onArtifactDelta?.(event.artifact_id, event.section_index, event.delta)
        break
      case "artifact_done":
        cb.onArtifactDone?.(event.artifact_id, event.payload)
        break
      case "quick_actions":
        cb.onQuickActions?.(event.actions)
        break
      case "approval_required":
        cb.onApprovalRequired?.(event.approval, event.call)
        break
      case "draft_created":
        cb.onDraftCreated?.(event.artifact_id, event.draft)
        break
      case "ui_command":
        cb.onUiCommand?.(event.command)
        break
      case "error":
        cb.onError?.(event.message)
        break
      case "done":
        cb.onDone?.(event.text, event.reason)
        break
    }
  }, [])

  const connectStream = useCallback(async (id: string, resume: boolean) => {
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const url = `/admin/kami/chat/stream/${id}${resume ? "?resume=true" : ""}`
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Stream error: ${response.status}`)
      }

      setState("streaming")
      reconnectAttemptsRef.current = 0

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE blocks separated by double newlines
        const blocks = buffer.split("\n\n")
        buffer = blocks.pop() || "" // Last incomplete block stays in buffer

        for (const block of blocks) {
          if (!block.trim() || block.startsWith(": ")) continue // Skip comments/heartbeats
          const event = parseSseBlock(block)
          if (event) processEvent(event)

          // Check for terminal events
          if (event?.type === "done" || event?.type === "error") {
            setState(event.type === "error" ? "error" : "completed")
            return
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return

      // Auto-reconnect with exponential backoff
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current),
          MAX_RECONNECT_DELAY_MS
        )
        reconnectAttemptsRef.current++
        setState("reconnecting")

        reconnectTimerRef.current = setTimeout(() => {
          connectStream(id, true) // Resume on reconnect
        }, delay)
      } else {
        setState("disconnected")
        callbacksRef.current.onError?.("Connection lost after max retries")
      }
    }
  }, [parseSseBlock, processEvent, setState])

  /**
   * Connect to an existing stream by streamId.
   * Does NOT start a new generation — only subscribes to events.
   * Used when reconnecting after navigating away and back.
   */
  const connect = useCallback(async (id: string, sessionId?: string) => {
    // Abort any existing connection first
    abortRef.current?.abort()
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)

    setState("connecting")
    reconnectAttemptsRef.current = 0
    setStreamId(id)

    if (sessionId) {
      callbacksRef.current.onSession?.(sessionId)
    }

    // Connect with resume=true to replay buffered events
    await connectStream(id, true)
  }, [connectStream, setState])

  /**
   * Check if a session has an active generation job, and reconnect if so.
   * Returns true if reconnected, false if no active job exists.
   * Call this when opening a session to auto-resume any running generation.
   */
  const checkAndResume = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/admin/kami/chat/stream-status/${sessionId}`)
      if (!response.ok) return false

      const status = await response.json()
      if (!status.active) return false

      // Active job found — reconnect to it
      await connect(status.streamId, sessionId)
      return true
    } catch {
      return false
    }
  }, [connect])

  const send = useCallback(async (message: string, sessionId?: string) => {
    // Abort any existing connection
    abortRef.current?.abort()
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)

    setState("connecting")
    reconnectAttemptsRef.current = 0

    try {
      const response = await fetch("/admin/kami/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Failed to start" }))
        setState("error")
        callbacksRef.current.onError?.(err.error || "Failed to start generation")
        return
      }

      const { streamId: id, sessionId: sid, resumed } = await response.json()
      setStreamId(id)
      callbacksRef.current.onSession?.(sid)

      // Connect to the SSE stream (resume if the job already existed)
      await connectStream(id, resumed ? true : false)
    } catch (err: any) {
      setState("error")
      callbacksRef.current.onError?.(err.message || "Failed to send message")
    }
  }, [connectStream, setState])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)

    // Only abort the server-side generation when user explicitly clicks stop
    if (streamId) {
      fetch(`/admin/kami/chat/stream/${streamId}`, { method: "DELETE" }).catch(() => {})
    }

    setState("idle")
    setStreamId(null)
  }, [streamId, setState])

  // ── Cleanup on unmount: close SSE but keep server generation running ──
  // When the user navigates away, we abort the local fetch (SSE connection)
  // but do NOT call DELETE — the generation continues independently.
  // Only the explicit stop() button aborts server-side generation.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }
  }, [])

  return {
    send,
    stop,
    connect,
    checkAndResume,
    connectionState,
    streamId,
  }
}
