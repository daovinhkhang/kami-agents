/**
 * render_artifact — LLM-driven artifact generation.
 *
 * Replaces the hardcoded keyword-match + 9 if-else block pattern in
 * artifact-builder.ts. The LLM decides the structure (KPI, table, chart,
 * text, order_card, product_card, customer_card, action_list, comparison)
 * and calls this tool to render sections incrementally.
 *
 * Each call merges sections into the current turn's artifact. Multiple
 * calls during a turn produce incremental updates that the frontend
 * renders progressively via artifact_delta events.
 */

import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"
import type { ArtifactSection, ArtifactPayload, ArtifactDelta } from "../../report/types"

// ── In-memory artifact state per session (cleared on turn end) ──

const turnArtifacts = new Map<string, ArtifactPayload>()

export const getTurnArtifact = (sessionId: string): ArtifactPayload | undefined =>
  turnArtifacts.get(sessionId)

export const clearTurnArtifact = (sessionId: string): void => {
  turnArtifacts.delete(sessionId)
}

// ── Schema ──

const sectionSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["kpi", "table", "chart", "text", "order_card", "product_card", "customer_card", "action_list", "comparison"],
      description: "Section type",
    },
    title: { type: "string", description: "Section heading" },
    // KPI
    cards: {
      type: "array",
      description: "For kpi type: array of KPI cards",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          trend: { type: "string", enum: ["up", "down", "flat"] },
          delta: { type: "string" },
          subtitle: { type: "string" },
        },
        required: ["label", "value"],
      },
    },
    // Table
    columns: {
      type: "array",
      description: "For table type: column definitions",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          align: { type: "string", enum: ["left", "right", "center"] },
          format: { type: "string", enum: ["text", "number", "money", "date", "badge"] },
        },
        required: ["key", "label"],
      },
    },
    rows: {
      type: "array",
      description: "For table type: data rows",
      items: { type: "object" },
    },
    total_rows: { type: "number", description: "For table type: total row count" },
    // Chart
    chart_type: {
      type: "string",
      enum: ["bar", "line", "pie", "doughnut", "area"],
      description: "For chart type",
    },
    data: { type: "object", description: "For chart type: { labels, datasets }" },
    // Text
    content: { type: "string", description: "For text type: markdown content" },
    // Order cards
    orders: { type: "array", description: "For order_card type", items: { type: "object" } },
    // Product cards
    products: { type: "array", description: "For product_card type", items: { type: "object" } },
    // Customer cards
    customers: { type: "array", description: "For customer_card type", items: { type: "object" } },
    // Action list
    actions: { type: "array", description: "For action_list type", items: { type: "object" } },
    // Comparison
    periods: { type: "array", description: "For comparison type", items: { type: "object" } },
  },
  required: ["type", "title"],
}

// ── Handler ──

export const renderArtifactHandler = async (args: Record<string, unknown>, ctx: KamiCtx) => {
  const action = (args.action as string) || "append"
  const title = (args.title as string) || "KAMI Report"
  const dateRange = (args.date_range as ArtifactPayload["date_range"]) || {
    from: new Date().toISOString(),
    to: new Date().toISOString(),
    label: "Current context",
  }
  const sections = (args.sections as ArtifactSection[]) || []

  // Validate sections
  const validSections: ArtifactSection[] = []
  for (const section of sections) {
    if (!section || typeof section !== "object") continue
    if (!section.type || !section.title) continue
    validSections.push(section as ArtifactSection)
  }

  let artifact = turnArtifacts.get(ctx.sessionId)

  if (!artifact || action === "create") {
    // Create new artifact
    artifact = {
      version: "1.0",
      title,
      generated_at: new Date().toISOString(),
      timezone: ctx.config.timezone,
      utc_offset: ctx.config.utcOffset,
      date_range: dateRange,
      sections: [],
      data_sources: [],
    }
  }

  // Merge sections based on action
  if (action === "replace") {
    artifact.sections = validSections
  } else if (action === "update_section") {
    const index = (args.section_index as number) ?? 0
    if (validSections.length > 0) {
      artifact.sections[index] = validSections[0]
    }
  } else {
    // append (default) — add new sections
    artifact.sections.push(...validSections)
  }

  // Update metadata
  artifact.generated_at = new Date().toISOString()
  artifact.title = title
  if (args.date_range) {
    artifact.date_range = dateRange
  }

  turnArtifacts.set(ctx.sessionId, artifact)

  // Persist to DB
  let persistedArtifact: any = null
  try {
    const existing = await (ctx.kami as any).listKamiArtifacts(
      { session_id: ctx.sessionId, type: "report" },
      { take: 1, order: { created_at: "DESC" } }
    )

    if (existing?.length > 0) {
      persistedArtifact = await (ctx.kami as any).updateKamiArtifacts({
        id: existing[0].id,
        title: artifact.title,
        payload: artifact,
        metadata: {
          generated_at: artifact.generated_at,
          timezone: artifact.timezone,
          utc_offset: artifact.utc_offset,
          data_sources: artifact.data_sources,
        },
      })
    } else {
      const [created] = await (ctx.kami as any).createKamiArtifacts([
        {
          session_id: ctx.sessionId,
          type: "report",
          title: artifact.title,
          schema_version: artifact.version,
          payload: artifact,
          metadata: {
            generated_at: artifact.generated_at,
            timezone: artifact.timezone,
            utc_offset: artifact.utc_offset,
            data_sources: artifact.data_sources,
          },
        },
      ])
      persistedArtifact = created
    }
  } catch {
    // Best-effort persistence; the in-memory artifact still works
  }

  const delta: ArtifactDelta = {
    artifact_id: persistedArtifact?.id || ctx.sessionId,
    action: action as ArtifactDelta["action"],
    sections: validSections,
  }

  return {
    artifact_id: persistedArtifact?.id || ctx.sessionId,
    id: persistedArtifact?.id || ctx.sessionId,
    payload: artifact,
    delta,
    section_count: artifact.sections.length,
    sections_added: validSections.length,
  }
}

// ── Registration ──

export const registerRenderArtifactTool = () => {
  registerTool({
    name: "render_artifact",
    toolset: "admin",
    description:
      "Render a structured artifact (report, dashboard, analysis) with KPI cards, tables, charts, " +
      "and commerce-specific cards. Call this during a turn to build the artifact incrementally. " +
      "Use 'create' action for the first call, then 'append' to add more sections, " +
      "'replace' to replace all sections, or 'update_section' to update one section. " +
      "Available section types: kpi, table, chart, text, order_card, product_card, customer_card, action_list, comparison. " +
      "Use real data from your tool calls — never invent numbers. " +
      "Keep the chat response concise; the artifact panel will display the detailed report.",
    risk: "safe",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "append", "replace", "update_section"],
          description: "How to merge: create=new artifact, append=add sections, replace=replace all, update_section=update one section by index",
        },
        title: {
          type: "string",
          description: "Artifact title shown in the panel header",
        },
        date_range: {
          type: "object",
          description: "Date range for the report data. Use actual dates from your queries.",
          properties: {
            from: { type: "string", description: "ISO date string for start of period" },
            to: { type: "string", description: "ISO date string for end of period" },
            label: { type: "string", description: "Human-readable label like 'Last 30 days' or 'June 2026'" },
          },
        },
        section_index: {
          type: "number",
          description: "For update_section action: the 0-based index of the section to update",
        },
        sections: {
          type: "array",
          description: "One or more sections to add/update",
          items: sectionSchema,
        },
      },
      required: ["action", "sections"],
    },
    handler: renderArtifactHandler,
  })
}
