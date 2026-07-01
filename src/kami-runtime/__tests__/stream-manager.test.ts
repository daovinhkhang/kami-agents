/**
 * StreamManager Unit Tests
 *
 * Tests: createJob, pushEvent, subscribe, getEventsForResume, abort, cleanup.
 *
 * Run: npx tsx --test src/kami-runtime/__tests__/stream-manager.test.ts
 */

import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { StreamManager } from "../loop/stream-manager"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("StreamManager", () => {
  let manager: StreamManager

  beforeEach(() => {
    manager = new StreamManager({ jobTtlMs: 10 })
  })

  describe("createJob", () => {
    it("creates a job with a unique ID", () => {
      const job = manager.createJob("session-1")

      assert.ok(job.id.startsWith("gen_"))
      assert.equal(job.sessionId, "session-1")
      assert.equal(job.status, "running")
      assert.equal(job.events.length, 0)
      assert.equal(job.subscriberCount, 0)
    })

    it("creates unique IDs for different jobs", () => {
      const job1 = manager.createJob("session-1")
      const job2 = manager.createJob("session-2")

      assert.notEqual(job1.id, job2.id)
    })
  })

  describe("pushEvent", () => {
    it("pushes events to a job", () => {
      const job = manager.createJob("session-1")

      manager.pushEvent(job.id, { type: "text_delta", delta: "Hello" })
      manager.pushEvent(job.id, { type: "text_delta", delta: " World" })

      const stored = manager.getJob(job.id)
      assert.equal(stored!.events.length, 2)
    })

    it("notifies subscribers of new events", async () => {
      const job = manager.createJob("session-1")
      const received: any[] = []

      manager.subscribe(job.id, (event) => {
        received.push(event)
      })

      manager.pushEvent(job.id, { type: "text_delta", delta: "test" })

      // Subscribers are called synchronously, so we can check immediately
      assert.equal(received.length, 1)
      assert.equal(received[0].type, "text_delta")
    })

    it("caps buffer at maxBufferSize", () => {
      const job = manager.createJob("session-1")
      job.maxBufferSize = 10 // Smaller for testing

      for (let i = 0; i < 15; i++) {
        manager.pushEvent(job.id, { type: "text_delta", delta: `msg-${i}` })
      }

      const stored = manager.getJob(job.id)
      // Buffer should be capped (first events summarized into one)
      assert.ok(stored!.events.length <= 11) // 1 summary + 10 events max
    })
  })

  describe("subscribe", () => {
    it("returns an unsubscribe function", () => {
      const job = manager.createJob("session-1")
      const received: any[] = []

      const unsub = manager.subscribe(job.id, (event) => {
        received.push(event)
      })

      manager.pushEvent(job.id, { type: "text_delta", delta: "first" })
      assert.equal(received.length, 1)

      unsub()

      manager.pushEvent(job.id, { type: "text_delta", delta: "second" })
      assert.equal(received.length, 1) // Should still be 1
    })
  })

  describe("getEventsForResume", () => {
    it("returns all buffered events", () => {
      const job = manager.createJob("session-1")

      manager.pushEvent(job.id, { type: "session", session_id: "s1" })
      manager.pushEvent(job.id, { type: "text_delta", delta: "Hello" })
      manager.pushEvent(job.id, { type: "done", reason: "completed" })

      const events = manager.getEventsForResume(job.id)
      assert.equal(events.length, 3)
    })

    it("returns empty array for non-existent job", () => {
      const events = manager.getEventsForResume("non-existent")
      assert.equal(events.length, 0)
    })
  })

  describe("updateStatus", () => {
    it("updates job status", () => {
      const job = manager.createJob("session-1")
      manager.updateStatus(job.id, "completed")

      const updated = manager.getJob(job.id)
      assert.equal(updated!.status, "completed")
    })
  })

  describe("abort", () => {
    it("aborts a running job and notifies subscribers", async () => {
      const job = manager.createJob("session-1")
      const received: any[] = []

      manager.subscribe(job.id, (event) => {
        received.push(event)
      })

      const result = manager.abort(job.id)
      assert.equal(result, true)

      const updated = manager.getJob(job.id)
      assert.equal(updated!.status, "aborted")

      // Should have emitted a done event
      assert.ok(received.some((e) => e.type === "done" && e.reason === "halted"))
    })

    it("returns false for already completed job", () => {
      const job = manager.createJob("session-1")
      manager.updateStatus(job.id, "completed")

      const result = manager.abort(job.id)
      assert.equal(result, false)
    })
  })

  describe("getJob", () => {
    it("returns undefined for non-existent job", () => {
      const job = manager.getJob("non-existent")
      assert.equal(job, undefined)
    })
  })

  describe("getActiveJobBySessionId", () => {
    it("returns the active job for a session", () => {
      manager.createJob("session-1")
      const job2 = manager.createJob("session-2")

      const found = manager.getActiveJobBySessionId("session-2")
      assert.equal(found!.id, job2.id)
      assert.equal(found!.sessionId, "session-2")
    })

    it("returns undefined when no job exists for the session", () => {
      const found = manager.getActiveJobBySessionId("no-such-session")
      assert.equal(found, undefined)
    })

    it("returns undefined for completed jobs", () => {
      const job = manager.createJob("session-1")
      manager.updateStatus(job.id, "completed")

      const found = manager.getActiveJobBySessionId("session-1")
      assert.equal(found, undefined)
    })

    it("returns undefined for errored jobs", () => {
      const job = manager.createJob("session-1")
      manager.updateStatus(job.id, "errored")

      const found = manager.getActiveJobBySessionId("session-1")
      assert.equal(found, undefined)
    })

    it("returns undefined for aborted jobs", () => {
      const job = manager.createJob("session-1")
      manager.abort(job.id)

      const found = manager.getActiveJobBySessionId("session-1")
      assert.equal(found, undefined)
    })

    it("still returns a paused job", () => {
      const job = manager.createJob("session-1")
      manager.updateStatus(job.id, "paused")

      const found = manager.getActiveJobBySessionId("session-1")
      assert.equal(found!.id, job.id)
    })

    it("returns the first active job if multiple jobs for same session", () => {
      // Create two jobs for the same session, complete the first one
      const job1 = manager.createJob("session-1")
      manager.updateStatus(job1.id, "completed")
      const job2 = manager.createJob("session-1")

      const found = manager.getActiveJobBySessionId("session-1")
      assert.ok(found !== undefined)
      // Should find the running one (job2), not the completed one (job1)
      assert.equal(found!.id, job2.id)
      assert.equal(found!.status, "running")
    })
  })

  describe("cleanup", () => {
    it("removes completed jobs after the TTL", async () => {
      const job = manager.createJob("session-1")

      manager.updateStatus(job.id, "completed")
      await wait(20)

      assert.equal(manager.getJob(job.id), undefined)
    })

    it("removes subscribers after cleanup", async () => {
      const job = manager.createJob("session-1")
      manager.subscribe(job.id, () => {})

      manager.updateStatus(job.id, "completed")
      await wait(20)

      assert.equal(manager.getEventsForResume(job.id).length, 0)
    })

    it("reschedules cleanup when terminal status changes again", async () => {
      const job = manager.createJob("session-1")

      manager.updateStatus(job.id, "errored")
      manager.updateStatus(job.id, "aborted")
      await wait(20)

      assert.equal(manager.getJob(job.id), undefined)
    })
  })
})
