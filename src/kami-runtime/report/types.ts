import type { KamiToolRisk } from "../types"

export type ArtifactSection =
  | {
      type: "kpi"
      title: string
      cards: Array<{
        label: string
        value: string
        trend?: "up" | "down" | "flat"
        delta?: string
        subtitle?: string
      }>
    }
  | {
      type: "table"
      title: string
      columns: Array<{
        key: string
        label: string
        align?: "left" | "right" | "center"
        format?: "text" | "number" | "money" | "date" | "badge"
      }>
      rows: Array<Record<string, unknown>>
      total_rows: number
    }
  | {
      type: "chart"
      title: string
      chart_type: "bar" | "line" | "pie" | "doughnut" | "area"
      data: {
        labels: string[]
        datasets: Array<{
          label: string
          values: number[]
          color?: string
        }>
      }
    }
  | {
      type: "text"
      title?: string
      content: string
    }
  | {
      type: "order_card"
      title: string
      orders: Array<{
        id: string
        display_id: string
        status: string
        payment_status: string
        total: string
        customer_name?: string
        created_at?: string
        item_count?: number
      }>
    }
  | {
      type: "product_card"
      title: string
      products: Array<{
        id: string
        title: string
        status: string
        variant_count?: number
        thumbnail?: string
        price?: string
        sales_count?: number
      }>
    }
  | {
      type: "customer_card"
      title: string
      customers: Array<{
        id: string
        email: string
        name?: string
        order_count?: number
        total_spent?: string
        last_order_date?: string
      }>
    }
  | {
      type: "action_list"
      title: string
      actions: Array<{
        label: string
        description: string
        tool: string
        args?: Record<string, unknown>
        risk?: KamiToolRisk
        confirm_required?: boolean
      }>
    }
  | {
      type: "comparison"
      title: string
      periods: Array<{
        label: string
        metrics: Record<string, string | number>
      }>
    }

export type ArtifactPayload = {
  version: "1.0"
  title: string
  generated_at: string
  timezone: string
  utc_offset: string
  date_range: {
    from: string
    to: string
    label: string
  }
  sections: ArtifactSection[]
  data_sources: Array<{
    tool: string
    run_at: string
    row_count: number
  }>
}

/** Incremental update to an artifact while the turn is running. */
export type ArtifactDelta = {
  artifact_id: string
  action: "create" | "append" | "replace" | "update_section"
  /** For create: the full payload. For append/replace: sections to merge. */
  payload?: ArtifactPayload
  /** For append: new sections to add. */
  sections?: ArtifactSection[]
  /** For update_section: replace section at this index (0-based). */
  section_index?: number
  section?: ArtifactSection
}

export type QuickActionPayload = {
  label: string
  description: string
  kind: "create" | "export" | "schedule" | "inspect" | "fix" | "report" | "draft"
  tool: string
  args: Record<string, unknown>
  risk: KamiToolRisk
  confirm_required: boolean
  artifact_id?: string
  session_id?: string
}

export type ReportTemplate = {
  id: string
  name: string
  title: string
  description: string
  prompt: string
  required_tools: string[]
  category: string
  schedule_presets?: Array<{
    label: string
    schedule: string
  }>
}
