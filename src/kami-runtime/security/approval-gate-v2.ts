/**
 * ApprovalGate v2 — Hermes-style blocking approval with scope support.
 *
 * Two-phase pattern:
 *   1. createRequest() — persists the pending approval, returns immediately
 *   2. waitForDecision() — blocks until the user decides (or timeout)
 *
 * This separation lets run-turn.ts YIELD the approval_required event
 * BEFORE blocking, so the frontend can render the ApprovalCard inline.
 *
 * Approval scopes (Hermes pattern):
 *   - "once"    — only this specific call (default)
 *   - "session" — all matching calls this session (cached in-memory)
 *   - "always"  — persisted to KAMI config (survives sessions)
 *
 * Timeout: 120s → auto-reject with diagnostic message.
 */

import type { KamiCtx, KamiToolCall } from "../types"

// ── Types ──

export type ApprovalScope = "once" | "session" | "always"

export type ApprovalRequest = {
  id: string
  sessionId: string
  tool: string
  args: Record<string, unknown>
  risk: string
  requestedAt: Date
  timeoutMs: number
}

export type ApprovalDecision = {
  approved: boolean
  scope: ApprovalScope
  decidedAt: Date
  decidedBy?: string
  reason?: string
}

type PendingEntry = {
  request: ApprovalRequest
  resolve: (decision: ApprovalDecision) => void
  timer: ReturnType<typeof setTimeout>
}

// ── Gate ──

export class ApprovalGate {
  private pending = new Map<string, PendingEntry>()
  /** session-scoped approvals: Map<sessionId, Set<toolKey>> */
  private sessionCache = new Map<string, Set<string>>()
  private defaultTimeoutMs = 120_000

  /**
   * Phase 1: Create the approval request (non-blocking).
   * Returns the request so the caller can emit an event to the frontend.
   * Also checks the session cache — if already approved for this session,
   * returns { alreadyApproved: true }.
   */
  async createRequest(
    ctx: KamiCtx,
    call: KamiToolCall,
    risk: string
  ): Promise<{ alreadyApproved: true } | { alreadyApproved: false; request: ApprovalRequest }> {
    // Check session-scope cache
    const toolKey = this.makeToolKey(call)
    if (this.sessionCache.get(ctx.sessionId)?.has(toolKey)) {
      return { alreadyApproved: true }
    }

    const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const request: ApprovalRequest = {
      id: approvalId,
      sessionId: ctx.sessionId,
      tool: call.name,
      args: call.arguments,
      risk,
      requestedAt: new Date(),
      timeoutMs: this.defaultTimeoutMs,
    }

    // Persist to DB (best-effort)
    try {
      await (ctx.kami as any).createKamiApprovals([
        {
          id: approvalId,
          session_id: ctx.sessionId,
          tool: call.name,
          args: call.arguments,
          status: "pending",
          requested_at: request.requestedAt,
        },
      ])
    } catch {
      // DB persistence is best-effort; the in-memory gate still works
    }

    return { alreadyApproved: false, request }
  }

  /**
   * Phase 2: Wait for the user's decision (BLOCKING).
   * Returns the decision after the user clicks Approve/Reject, or on timeout.
   * Call this AFTER yielding the approval_required event to the frontend.
   */
  async waitForDecision(
    request: ApprovalRequest,
    ctx: KamiCtx,
    call: KamiToolCall
  ): Promise<ApprovalDecision> {
    const decision = await new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        resolve({
          approved: false,
          scope: "once",
          decidedAt: new Date(),
          reason: `Approval timed out after ${this.defaultTimeoutMs / 1000}s`,
        })
      }, this.defaultTimeoutMs)

      this.pending.set(request.id, { request, resolve, timer })
    })

    // Update session cache for session-scope approvals
    if (decision.approved && decision.scope === "session") {
      if (!this.sessionCache.has(ctx.sessionId)) {
        this.sessionCache.set(ctx.sessionId, new Set())
      }
      this.sessionCache.get(ctx.sessionId)!.add(this.makeToolKey(call))
    }

    // Update DB (best-effort)
    try {
      await (ctx.kami as any).updateKamiApprovals({
        id: request.id,
        status: decision.approved ? "approved" : "rejected",
        decided_at: decision.decidedAt,
        decided_by: decision.decidedBy,
        reason: decision.reason,
        scope: decision.scope,
      })
    } catch {
      // Best-effort
    }

    return decision
  }

  /**
   * Resolve a pending approval. Called by the decide API route.
   */
  resolve(id: string, decision: ApprovalDecision): boolean {
    const entry = this.pending.get(id)
    if (!entry) return false

    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(decision)
    return true
  }

  /**
   * Check if there's a pending approval for a session (for UI polling).
   */
  getPendingForSession(sessionId: string): ApprovalRequest[] {
    const result: ApprovalRequest[] = []
    for (const [, entry] of this.pending) {
      if (entry.request.sessionId === sessionId) {
        result.push(entry.request)
      }
    }
    return result
  }

  /**
   * Reject all pending approvals for a session (cleanup on disconnect).
   */
  rejectAllForSession(sessionId: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.request.sessionId === sessionId) {
        clearTimeout(entry.timer)
        this.pending.delete(id)
        entry.resolve({
          approved: false,
          scope: "once",
          decidedAt: new Date(),
          reason: "Session disconnected or cancelled",
        })
      }
    }
  }

  /**
   * Clear session-scope cache (called when session ends).
   */
  clearSessionCache(sessionId: string): void {
    this.sessionCache.delete(sessionId)
  }

  // ── Private helpers ──

  private makeToolKey(call: KamiToolCall): string {
    // Use stable arg key to match identical calls within a session
    const argsKey = call.arguments && typeof call.arguments === "object"
      ? JSON.stringify(call.arguments, Object.keys(call.arguments as object).sort())
      : JSON.stringify(call.arguments ?? null)
    return `${call.name}:${argsKey}`
  }
}

// ── Singleton ──

let _instance: ApprovalGate | null = null

export const getApprovalGate = (): ApprovalGate => {
  if (!_instance) {
    _instance = new ApprovalGate()
  }
  return _instance
}
