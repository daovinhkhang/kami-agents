/**
 * ApprovalGate v2 Unit Tests
 *
 * Tests: createRequest, waitForDecision, resolve, timeout,
 * session-scope caching, rejectAllForSession, clearSessionCache.
 *
 * Run: npx tsx --test src/kami-runtime/__tests__/approval-gate-v2.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { ApprovalGate } from "../security/approval-gate-v2"

function mockCtx(overrides: Record<string, any> = {}): any {
  return {
    scope: {} as any,
    kami: {
      createKamiApprovals: async () => [{ id: "db-approval-1" }],
      updateKamiApprovals: async () => ({ id: "db-approval-1" }),
    },
    config: {
      autonomyMode: "assist" as const,
      autonomyMaxMutationsPerTurn: 5,
      autonomyAllowDestructive: false,
      approvalRequired: false,
      destructiveTools: [],
      timezone: "Asia/Ho_Chi_Minh",
      utcOffset: "UTC+7",
    },
    sessionId: "test-session-1",
    userId: "test-user",
    toolset: "admin",
    executor: {} as any,
    ...overrides,
  } as any
}

function mockCall(overrides: Record<string, any> = {}): any {
  return {
    id: "call-1",
    name: "create_product",
    arguments: { title: "Test Product", status: "draft" },
    ...overrides,
  } as any
}

describe("ApprovalGate", () => {
  let gate: ApprovalGate

  beforeEach(() => {
    gate = new ApprovalGate()
  })

  afterEach(() => {
    // Clean up any pending promises
  })

  describe("createRequest", () => {
    it("creates a pending request and returns it (non-blocking)", async () => {
      const ctx = mockCtx()
      const call = mockCall()

      const result: any = await gate.createRequest(ctx, call, "mutating")

      assert.equal(result.alreadyApproved, false)
      assert.equal(result.request.tool, "create_product")
      assert.equal(result.request.risk, "mutating")
      assert.equal(result.request.sessionId, "test-session-1")
      assert.ok(result.request.id.startsWith("approval_"))
    })

    it("returns alreadyApproved=true for session-cached tools", async () => {
      const ctx = mockCtx()
      const call = mockCall()

      const first: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(first.alreadyApproved, false)

      // Start waiting (register pending), then resolve from a setTimeout
      const decisionPromise = gate.waitForDecision(first.request, ctx, call)

      // Resolve after a tick (pending entry is now registered)
      setTimeout(() => {
        gate.resolve(first.request.id, {
          approved: true,
          scope: "session",
          decidedAt: new Date(),
        })
      }, 10)

      await decisionPromise

      // Second call with same tool+args should now be cached
      const second: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(second.alreadyApproved, true)
    })

    it("requires a new approval for different arguments", async () => {
      const ctx = mockCtx()
      const call1 = mockCall({ arguments: { title: "Product A" } })
      const call2 = mockCall({ arguments: { title: "Product B" } })

      const r1: any = await gate.createRequest(ctx, call1, "mutating")
      const dp1 = gate.waitForDecision(r1.request, ctx, call1)
      setTimeout(() => {
        gate.resolve(r1.request.id, { approved: true, scope: "session", decidedAt: new Date() })
      }, 10)
      await dp1

      const r2: any = await gate.createRequest(ctx, call2, "mutating")
      assert.equal(r2.alreadyApproved, false)
    })
  })

  describe("waitForDecision", () => {
    it("resolves with approved=true when resolve() is called with approved", async () => {
      const ctx = mockCtx()
      const call = mockCall()
      const result: any = await gate.createRequest(ctx, call, "mutating")

      // Resolve in 50ms
      setTimeout(() => {
        gate.resolve(result.request.id, { approved: true, scope: "once", decidedAt: new Date() })
      }, 50)

      const decision = await gate.waitForDecision(result.request, ctx, call)
      assert.equal(decision.approved, true)
      assert.equal(decision.scope, "once")
    })

    it("resolves with approved=false when resolve() is called with rejected", async () => {
      const ctx = mockCtx()
      const call = mockCall()
      const result: any = await gate.createRequest(ctx, call, "mutating")

      setTimeout(() => {
        gate.resolve(result.request.id, { approved: false, scope: "once", decidedAt: new Date(), reason: "Rejected" })
      }, 50)

      const decision = await gate.waitForDecision(result.request, ctx, call)
      assert.equal(decision.approved, false)
    })

    it("updates session cache when approved with session scope", async () => {
      const ctx = mockCtx()
      const call = mockCall()

      const r1: any = await gate.createRequest(ctx, call, "mutating")
      const dp1 = gate.waitForDecision(r1.request, ctx, call)
      setTimeout(() => {
        gate.resolve(r1.request.id, { approved: true, scope: "session", decidedAt: new Date() })
      }, 10)
      await dp1

      const r2: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(r2.alreadyApproved, true)
    })

    it("does NOT cache when approved with once scope", async () => {
      const ctx = mockCtx()
      const call = mockCall()

      const r1: any = await gate.createRequest(ctx, call, "mutating")
      const dp1 = gate.waitForDecision(r1.request, ctx, call)
      setTimeout(() => {
        gate.resolve(r1.request.id, { approved: true, scope: "once", decidedAt: new Date() })
      }, 10)
      await dp1

      const r2: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(r2.alreadyApproved, false)
    })
  })

  describe("resolve", () => {
    it("returns false for non-existent approval ID", () => {
      const result = gate.resolve("non-existent-id", {
        approved: true,
        scope: "once",
        decidedAt: new Date(),
      })
      assert.equal(result, false)
    })

    it("returns true for valid pending approval", async () => {
      const ctx = mockCtx()
      const call = mockCall()
      const result: any = await gate.createRequest(ctx, call, "mutating")

      // Start waiting first (registers pending entry), then resolve
      const dp = gate.waitForDecision(result.request, ctx, call)
      const resolveResult = gate.resolve(result.request.id, {
        approved: true,
        scope: "once",
        decidedAt: new Date(),
      })
      assert.equal(resolveResult, true)
      await dp
    })
  })

  describe("getPendingForSession", () => {
    it("returns pending approvals for a session", async () => {
      const ctx = mockCtx()
      const call1 = mockCall({ id: "call-1", name: "tool_a" })
      const call2 = mockCall({ id: "call-2", name: "tool_b" })

      const r1: any = await gate.createRequest(ctx, call1, "mutating")
      const r2: any = await gate.createRequest(ctx, call2, "destructive")

      // Register both as pending before checking
      const dp1 = gate.waitForDecision(r1.request, ctx, call1)
      const dp2 = gate.waitForDecision(r2.request, ctx, call2)

      const pending = gate.getPendingForSession("test-session-1")
      assert.ok(pending.length >= 1)

      // Clean up
      gate.resolve(r1.request.id, { approved: false, scope: "once", decidedAt: new Date() })
      gate.resolve(r2.request.id, { approved: false, scope: "once", decidedAt: new Date() })
      await dp1
      await dp2
    })
  })

  describe("rejectAllForSession", () => {
    it("rejects all pending approvals for a session", async () => {
      const ctx = mockCtx({ sessionId: "reject-test-session" })
      const call = mockCall()
      const result: any = await gate.createRequest(ctx, call, "mutating")

      // Start waiting first, then reject all
      const decisionPromise = gate.waitForDecision(result.request, ctx, call)

      // Small delay to ensure pending entry is registered
      await new Promise((r) => setTimeout(r, 5))
      gate.rejectAllForSession("reject-test-session")

      const decision = await decisionPromise
      assert.equal(decision.approved, false)
      assert.ok(decision.reason?.includes("disconnected"))
    })
  })

  describe("clearSessionCache", () => {
    it("clears session-scope approvals", async () => {
      const ctx = mockCtx()
      const call = mockCall()

      const r1: any = await gate.createRequest(ctx, call, "mutating")
      const dp1 = gate.waitForDecision(r1.request, ctx, call)
      setTimeout(() => {
        gate.resolve(r1.request.id, { approved: true, scope: "session", decidedAt: new Date() })
      }, 10)
      await dp1

      const r2: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(r2.alreadyApproved, true)

      gate.clearSessionCache("test-session-1")

      const r3: any = await gate.createRequest(ctx, call, "mutating")
      assert.equal(r3.alreadyApproved, false)
    })
  })
})
