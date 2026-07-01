/**
 * ArtifactSectionRender — dispatcher that renders each section type.
 * Like LibreChat's Part.tsx but for commerce artifact sections.
 */

import { Badge, Text } from "@medusajs/ui"

type SectionProps = {
  section: any
  index: number
}

const TrendBadge = ({ trend, delta }: { trend?: string; delta?: string }) => {
  if (!trend && !delta) return null
  const color = trend === "up" ? "green" : trend === "down" ? "red" : "grey"
  return (
    <span style={{ fontSize: 12, color: `var(--fg-${color})`, marginLeft: 4 }}>
      {delta || trend}
    </span>
  )
}

const KpiSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 8 }}>{section.title}</Text>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {(section.cards || []).map((card: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 6,
          padding: "10px 12px",
          background: "var(--bg-component)",
        }}>
          <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{card.label}</Text>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <Text size="large" weight="plus">{card.value}</Text>
            <TrendBadge trend={card.trend} delta={card.delta} />
          </div>
          {card.subtitle && <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{card.subtitle}</Text>}
        </div>
      ))}
    </div>
  </div>
)

const TableSection = ({ section }: SectionProps) => {
  const rows = section.rows || []
  const columns = section.columns || []
  return (
    <div style={{ marginBottom: 16 }}>
      <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--border-base)" }}>
              {columns.map((col: any, i: number) => (
                <th key={i} style={{
                  textAlign: col.align || "left",
                  padding: "4px 8px",
                  color: "var(--fg-muted)",
                  fontWeight: 600,
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row: any, ri: number) => (
              <tr key={ri} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {columns.map((col: any, ci: number) => {
                  const value = row[col.key]
                  const display = col.format === "money" && typeof value === "number"
                    ? value.toLocaleString("en-US") + " VND"
                    : col.format === "badge"
                    ? <Badge size="small">{String(value ?? "")}</Badge>
                    : String(value ?? "")
                  return (
                    <td key={ci} style={{
                      textAlign: col.align || "left",
                      padding: "3px 8px",
                      fontFamily: col.format === "number" || col.format === "money" ? "monospace" : undefined,
                    }}>
                      {display as any}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {section.total_rows > rows.length && (
          <Text size="xsmall" style={{ color: "var(--fg-muted)", marginTop: 4 }}>
            Showing {rows.length} of {section.total_rows} rows
          </Text>
        )}
      </div>
    </div>
  )
}

const ChartSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{
      border: "1px solid var(--border-base)",
      borderRadius: 6,
      padding: 12,
      background: "var(--bg-component)",
      minHeight: 120,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <Text size="small" style={{ color: "var(--fg-muted)" }}>
        [{section.chart_type || "bar"} chart — {section.data?.labels?.length || 0} data points]
      </Text>
    </div>
  </div>
)

const TextSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    {section.title && <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>}
    <Text size="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{section.content}</Text>
  </div>
)

const OrderCardSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(section.orders || []).slice(0, 20).map((order: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 6,
          padding: "8px 12px",
          background: "var(--bg-component)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <Text size="small" weight="plus">#{order.display_id || order.id}</Text>
            <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{order.customer_name || ""}</Text>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Badge size="small">{order.status}</Badge>
            <Badge size="small" color={order.payment_status === "captured" ? "green" : "orange"}>
              {order.payment_status}
            </Badge>
            <Text size="small" weight="plus" style={{ fontFamily: "monospace" }}>{order.total}</Text>
          </div>
        </div>
      ))}
    </div>
  </div>
)

const ProductCardSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
      {(section.products || []).slice(0, 20).map((product: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 6,
          padding: 8,
          background: "var(--bg-component)",
        }}>
          <Text size="small" weight="plus">{product.title}</Text>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <Badge size="small">{product.status}</Badge>
            {product.price && <Text size="xsmall" style={{ fontFamily: "monospace" }}>{product.price}</Text>}
          </div>
          {product.sales_count !== undefined && (
            <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{product.sales_count} sales</Text>
          )}
        </div>
      ))}
    </div>
  </div>
)

const CustomerCardSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {(section.customers || []).slice(0, 15).map((customer: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 4,
          padding: "6px 10px",
          background: "var(--bg-component)",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <div>
            <Text size="small">{customer.name || customer.email}</Text>
            {customer.name && <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{customer.email}</Text>}
          </div>
          <div style={{ textAlign: "right" }}>
            {customer.order_count !== undefined && (
              <Text size="small" style={{ fontFamily: "monospace" }}>{customer.order_count} orders</Text>
            )}
            {customer.total_spent && (
              <Text size="small" weight="plus" style={{ fontFamily: "monospace" }}>{customer.total_spent}</Text>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const ActionListSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {(section.actions || []).map((action: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 4,
          padding: "8px 10px",
          background: "var(--bg-component)",
          cursor: "pointer",
        }}>
          <Text size="small" weight="plus">{action.label}</Text>
          <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{action.description}</Text>
        </div>
      ))}
    </div>
  </div>
)

const ComparisonSection = ({ section }: SectionProps) => (
  <div style={{ marginBottom: 16 }}>
    <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{section.title}</Text>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${(section.periods || []).length}, 1fr)`, gap: 8 }}>
      {(section.periods || []).map((period: any, i: number) => (
        <div key={i} style={{
          border: "1px solid var(--border-base)",
          borderRadius: 6,
          padding: 10,
          background: "var(--bg-component)",
        }}>
          <Text size="small" weight="plus" style={{ marginBottom: 6 }}>{period.label}</Text>
          {Object.entries(period.metrics || {}).map(([key, value]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>{key}</Text>
              <Text size="xsmall" weight="plus">{String(value)}</Text>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
)

// ── Dispatcher ──

const SECTION_RENDERERS: Record<string, React.FC<SectionProps>> = {
  kpi: KpiSection,
  table: TableSection,
  chart: ChartSection,
  text: TextSection,
  order_card: OrderCardSection,
  product_card: ProductCardSection,
  customer_card: CustomerCardSection,
  action_list: ActionListSection,
  comparison: ComparisonSection,
}

export const ArtifactSectionRender = ({ section, index }: SectionProps) => {
  const Renderer = SECTION_RENDERERS[section.type]
  if (!Renderer) {
    return (
      <div style={{ marginBottom: 16 }}>
        <Text size="small" style={{ color: "var(--fg-muted)" }}>
          Unknown section type: {section.type}
        </Text>
      </div>
    )
  }
  return <Renderer section={section} index={index} />
}
