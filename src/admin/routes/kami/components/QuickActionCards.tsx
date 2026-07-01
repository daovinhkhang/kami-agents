/**
 * QuickActionCards — render suggested actions as clickable buttons.
 * Data-driven — no hardcoded if-else patterns.
 */

import { Button, Text } from "@medusajs/ui"

type QuickAction = {
  label: string
  description?: string
  kind: string
  tool: string
  args: Record<string, any>
  risk: string
  confirm_required?: boolean
  artifact_id?: string
  session_id?: string
}

type QuickActionCardsProps = {
  actions: QuickAction[]
  onAction: (action: QuickAction) => void
}

const kindIcon = (kind: string): string => {
  switch (kind) {
    case "export": return "⬇" // down arrow
    case "create": return "+"
    case "schedule": return "⏰" // alarm clock
    case "inspect": return "\u{1F50D}" // magnifying glass
    case "fix": return "\u{1F527}" // wrench
    case "report": return "\u{1F4CA}" // bar chart
    case "draft": return "\u{1F4DD}" // memo
    default: return "▶" // play
  }
}

const kindColor = (kind: string): string => {
  switch (kind) {
    case "export": return "var(--bg-interactive-secondary)"
    case "create": return "var(--bg-interactive-primary)"
    case "schedule": return "var(--bg-highlight)"
    case "inspect": return "var(--bg-subtle)"
    case "fix": return "var(--bg-warning)"
    case "report": return "var(--bg-info)"
    case "draft": return "var(--bg-interactive-primary)"
    default: return "var(--bg-subtle)"
  }
}

export const QuickActionCards = ({ actions, onAction }: QuickActionCardsProps) => {
  if (!actions.length) return null

  return (
    <div style={{ padding: "8px 14px" }}>
      <Text size="xsmall" weight="plus" style={{ marginBottom: 6, color: "var(--fg-muted)" }}>
        Suggested actions
      </Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {actions.map((action, i) => (
          <Button
            key={i}
            size="small"
            variant="secondary"
            onClick={() => onAction(action)}
            title={action.description || action.label}
            style={{
              fontSize: 12,
              background: kindColor(action.kind),
            }}
          >
            {kindIcon(action.kind)} {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
