/**
 * Artifact Builder v2 Tests
 *
 * Tests: mergeArtifactDelta, shouldCreateArtifact, buildReportArtifactPayload.
 *
 * Run: npx tsx --test src/kami-runtime/__tests__/artifact-builder.test.ts
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  shouldCreateArtifact,
  buildReportArtifactPayload,
  mergeArtifactDelta,
  REPORT_ARTIFACT_TOOLS,
} from "../report/artifact-builder"
import type { ArtifactPayload, ArtifactDelta } from "../report/types"

const basePayload = (): ArtifactPayload => ({
  version: "1.0",
  title: "Test Report",
  generated_at: new Date().toISOString(),
  timezone: "Asia/Ho_Chi_Minh",
  utc_offset: "UTC+7",
  date_range: {
    from: new Date().toISOString(),
    to: new Date().toISOString(),
    label: "Test",
  },
  sections: [],
  data_sources: [],
})

describe("shouldCreateArtifact", () => {
  it("returns true when render_artifact was called", () => {
    const results = [{ call: { id: "1", name: "render_artifact", arguments: {} }, result: {} }]
    assert.equal(shouldCreateArtifact("any message", results), true)
  })

  it("returns true when a report tool was called", () => {
    for (const tool of REPORT_ARTIFACT_TOOLS) {
      if (tool === "render_artifact") continue
      const results = [{ call: { id: "1", name: tool, arguments: {} }, result: {} }]
      assert.equal(shouldCreateArtifact("any message", results), true, `Tool ${tool} should trigger artifact`)
    }
  })

  it("returns false when no report tools were called", () => {
    const results = [
      { call: { id: "1", name: "list_products", arguments: {} }, result: {} },
      { call: { id: "2", name: "graph", arguments: {} }, result: {} },
    ]
    assert.equal(shouldCreateArtifact("list products", results), false)
  })

  it("no longer uses keyword matching", () => {
    // Keywords like "bao cao" or "report" in the message no longer trigger
    const results: any[] = []
    assert.equal(shouldCreateArtifact("bao cao doanh thu", results), false)
    assert.equal(shouldCreateArtifact("sales report today", results), false)
  })
})

describe("buildReportArtifactPayload", () => {
  it("builds text sections from report tool results", () => {
    const payload = buildReportArtifactPayload({
      userMessage: "show inventory",
      results: [
        {
          call: { id: "1", name: "inventory_report", arguments: {} },
          result: { total_items_tracked: 100, low_stock_items: [] },
        },
      ],
    })

    assert.equal(payload.version, "1.0")
    assert.ok(payload.sections.length >= 1)
    assert.ok(payload.data_sources.length >= 1)
  })

  it("includes sections from render_artifact results", () => {
    const payload = buildReportArtifactPayload({
      userMessage: "create report",
      results: [
        {
          call: { id: "1", name: "render_artifact", arguments: {} },
          result: {
            artifact_id: "art-1",
            id: "art-1",
            payload: {
              version: "1.0",
              title: "My Report",
              sections: [
                { type: "kpi", title: "Sales", cards: [{ label: "Revenue", value: "100M" }] },
              ],
            },
          },
        },
      ],
    })

    assert.ok(payload.sections.some((s) => s.type === "kpi"))
  })

  it("creates fallback text section when no results", () => {
    const payload = buildReportArtifactPayload({
      userMessage: "hello",
      results: [],
    })

    assert.equal(payload.sections.length, 1)
    assert.equal(payload.sections[0].type, "text")
  })
})

describe("mergeArtifactDelta", () => {
  it("appends sections with append action", () => {
    const existing = basePayload()
    const delta: ArtifactDelta = {
      artifact_id: "art-1",
      action: "append",
      sections: [
        { type: "kpi", title: "KPIs", cards: [{ label: "Revenue", value: "100M" }] },
      ],
    }

    const merged = mergeArtifactDelta(existing, delta)
    assert.equal(merged.sections.length, 1)
    assert.equal(merged.sections[0].type, "kpi")
  })

  it("replaces all sections with replace action", () => {
    const existing = basePayload()
    existing.sections = [
      { type: "text", title: "Old", content: "old content" },
    ]

    const delta: ArtifactDelta = {
      artifact_id: "art-1",
      action: "replace",
      sections: [
        { type: "kpi", title: "New KPIs", cards: [] },
      ],
    }

    const merged = mergeArtifactDelta(existing, delta)
    assert.equal(merged.sections.length, 1)
    assert.equal(merged.sections[0].type, "kpi")
    assert.equal(merged.sections[0].title, "New KPIs")
  })

  it("replaces entire payload with create action", () => {
    const existing = basePayload()
    const newPayload = basePayload()
    newPayload.title = "Brand New Report"
    newPayload.sections = [{ type: "text", title: "New", content: "fresh" }]

    const delta: ArtifactDelta = {
      artifact_id: "art-2",
      action: "create",
      payload: newPayload,
    }

    const merged = mergeArtifactDelta(existing, delta)
    assert.equal(merged.title, "Brand New Report")
    assert.equal(merged.sections.length, 1)
  })

  it("updates a single section with update_section action", () => {
    const existing = basePayload()
    existing.sections = [
      { type: "text", title: "Section 1", content: "first" },
      { type: "text", title: "Section 2", content: "second" },
    ]

    const delta: ArtifactDelta = {
      artifact_id: "art-1",
      action: "update_section",
      section_index: 1,
      section: { type: "kpi", title: "Updated Section 2", cards: [] },
    }

    const merged = mergeArtifactDelta(existing, delta)
    assert.equal(merged.sections.length, 2)
    assert.equal(merged.sections[1].type, "kpi")
    assert.equal(merged.sections[1].title, "Updated Section 2")
  })

  it("handles multiple appends cumulatively", () => {
    let current = basePayload()

    current = mergeArtifactDelta(current, {
      artifact_id: "art-1",
      action: "append",
      sections: [{ type: "kpi", title: "KPIs", cards: [] }],
    })

    current = mergeArtifactDelta(current, {
      artifact_id: "art-1",
      action: "append",
      sections: [{ type: "table", title: "Data", columns: [], rows: [], total_rows: 0 }],
    })

    current = mergeArtifactDelta(current, {
      artifact_id: "art-1",
      action: "append",
      sections: [{ type: "text", title: "Summary", content: "All good" }],
    })

    assert.equal(current.sections.length, 3)
    assert.equal(current.sections[0].type, "kpi")
    assert.equal(current.sections[1].type, "table")
    assert.equal(current.sections[2].type, "text")
  })
})
