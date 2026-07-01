/**
 * StreamManager — resumable SSE generation job management.
 *
 * Inspired by LibreChat's resumable SSE pattern:
 *   1. POST /chat/start → creates a generation job, returns { streamId }
 *   2. GET /chat/stream/:streamId → SSE stream with ?resume=true support
 *   3. DELETE /chat/stream/:streamId → abort generation
 *
 * Events are buffered per-job. On resume, all buffered events are replayed
 * before continuing with live events. Buffer is capped at 500 events.
 */

import type { KamiEvent } from "../types"

// ── Types ──

export type GenerationJobStatus = "running" | "paused" | "completed" | "errored" | "aborted"

export type GenerationJob = {
  id: string
  sessionId: string
  status: GenerationJobStatus
  events: KamiEvent[]
  createdAt: Date
  lastActivityAt: Date
  subscriberCount: number
  /** Max buffered events before older ones are summarized. */
  maxBufferSize: number
}

// ── Manager ──

export class StreamManager {
  private jobs = new Map<string, GenerationJob>()
  /** Subscriber callbacks: jobId → Set<callback> */
  private subscribers = new Map<string, Set<(event: KamiEvent) => void>>()
  /** Cleanup timers: jobId → timer */
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private jobTtlMs: number

  constructor(options: { jobTtlMs?: number } = {}) {
    this.jobTtlMs = options.jobTtlMs ?? 30 * 60 * 1000 // 30 min TTL for completed jobs
  }

  /**
   * Create a new generation job.
   */
  createJob(sessionId: string): GenerationJob {
    const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: GenerationJob = {
      id,
      sessionId,
      status: "running",
      events: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
      subscriberCount: 0,
      maxBufferSize: 500,
    }
    this.jobs.set(id, job)
    this.subscribers.set(id, new Set())
    return job
  }

  /**
   * Push an event to a job. Notifies all subscribers.
   */
  pushEvent(jobId: string, event: KamiEvent): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.lastActivityAt = new Date()
    job.events.push(event)

    // Buffer cap: if over max, summarize older events
    if (job.events.length > job.maxBufferSize) {
      const excess = job.events.length - job.maxBufferSize
      // Replace the oldest events with a summary marker
      const summaryEvent: KamiEvent = {
        type: "text_delta",
        delta: `[${excess + 50} earlier events summarized — resume from here]`,
      }
      job.events = [summaryEvent, ...job.events.slice(excess + 50)]
    }

    // Notify subscribers
    const subs = this.subscribers.get(jobId)
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event)
        } catch {
          // Subscriber callback errors are silent
        }
      }
    }
  }

  /**
   * Subscribe to live events for a job.
   * Returns an unsubscribe function.
   */
  subscribe(jobId: string, callback: (event: KamiEvent) => void): () => void {
    const subs = this.subscribers.get(jobId)
    if (!subs) {
      // Job doesn't exist yet — create the subscriber set
      this.subscribers.set(jobId, new Set([callback]))
      const job = this.jobs.get(jobId)
      if (job) job.subscriberCount++
      return () => this.unsubscribe(jobId, callback)
    }

    subs.add(callback)
    const job = this.jobs.get(jobId)
    if (job) job.subscriberCount++

    return () => this.unsubscribe(jobId, callback)
  }

  private unsubscribe(jobId: string, callback: (event: KamiEvent) => void): void {
    const subs = this.subscribers.get(jobId)
    if (subs) {
      subs.delete(callback)
      const job = this.jobs.get(jobId)
      if (job) job.subscriberCount = Math.max(0, job.subscriberCount - 1)
    }
  }

  /**
   * Get events for resume. Returns all events buffered so far.
   */
  getEventsForResume(jobId: string): KamiEvent[] {
    const job = this.jobs.get(jobId)
    if (!job) return []
    return [...job.events]
  }

  /**
   * Update job status.
   */
  updateStatus(jobId: string, status: GenerationJobStatus): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = status
    job.lastActivityAt = new Date()

    // Schedule cleanup for terminal states
    if (status === "completed" || status === "errored" || status === "aborted") {
      this.scheduleCleanup(jobId)
    }
  }

  /**
   * Get job by ID.
   */
  getJob(jobId: string): GenerationJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Find the active (running/paused) job for a session.
   * Returns undefined if no active job exists for the session.
   * This allows the frontend to reconnect to a running generation
   * after navigating away and coming back.
   */
  getActiveJobBySessionId(sessionId: string): GenerationJob | undefined {
    for (const job of this.jobs.values()) {
      if (
        job.sessionId === sessionId &&
        (job.status === "running" || job.status === "paused")
      ) {
        return job
      }
    }
    return undefined
  }

  /**
   * Abort a running job. Notifies subscribers with a done event.
   */
  abort(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job || (job.status !== "running" && job.status !== "paused")) return false

    this.pushEvent(jobId, { type: "done", reason: "halted" })
    this.updateStatus(jobId, "aborted")
    return true
  }

  // ── Private ──

  private scheduleCleanup(jobId: string): void {
    // Clear existing timer
    const existing = this.cleanupTimers.get(jobId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.jobs.delete(jobId)
      this.subscribers.delete(jobId)
      this.cleanupTimers.delete(jobId)
    }, this.jobTtlMs)
    timer.unref?.()

    this.cleanupTimers.set(jobId, timer)
  }
}

// ── Singleton ──

let _instance: StreamManager | null = null

export const getStreamManager = (): StreamManager => {
  if (!_instance) {
    _instance = new StreamManager()
  }
  return _instance
}
