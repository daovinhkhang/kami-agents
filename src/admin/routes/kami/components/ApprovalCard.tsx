/**
 * ApprovalCard — Inline approval request displayed in the chat stream.
 *
 * Replaces the old pattern where approval was handled in a separate AdminDrawer.
 * Now the user can approve/reject directly in the chat without leaving context.
 *
 * Features:
 *   - 3 scope options: Once / This session / Always
 *   - Auto-reject countdown timer (120s)
 *   - Tool name, args preview, risk badge
 */

import { Badge, Button, Text, Tooltip } from "@medusajs/ui"
import { useEffect, useState } from "react"

type ApprovalRequest = {
  id: string
  sessionId: string
  tool: string
  args: Record<string, unknown>
  risk: string
  requestedAt: string
  timeoutMs: number
}

type ApprovalCardProps = {
  approval: ApprovalRequest
  onDecide: (id: string, approved: boolean, scope: "once" | "session" | "always") => void
}

const riskColor = (risk: string): "green" | "orange" | "red" | "grey" => {
  switch (risk) {
    case "read": return "green"
    case "safe": return "green"
    case "mutating": return "orange"
    case "destructive": return "red"
    default: return "grey"
  }
}

const formatArgs = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args).slice(0, 5)
  return entries.map(([k, v]) => {
    const val = typeof v === "string" ? (v.length > 40 ? v.slice(0, 40) + "..." : v) : JSON.stringify(v).slice(0, 40)
    return `${k}: ${val}`
  }).join(", ")
}

export const ApprovalCard = ({ approval, onDecide }: ApprovalCardProps) => {
  const [scope, setScope] = useState<"once" | "session" | "always">("once")
  const [countdown, setCountdown] = useState(Math.ceil(approval.timeoutMs / 1000))
  const [deciding, setDeciding] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          // Auto-reject on timeout
          onDecide(approval.id, false, "once")
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [approval.id, countdown, onDecide])

  const handleDecide = async (approved: boolean) => {
    setDeciding(true)
    try {
      await fetch(`/admin/kami/approvals/${approval.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: approved ? "approved" : "rejected",
          scope,
          reason: approved ? "Approved by user" : "Rejected by user",
        }),
      })
    } catch {
      // Even if the request fails, the gate will timeout and auto-reject
    }
    onDecide(approval.id, approved, scope)
    setDeciding(false)
  }

  const minutes = Math.floor(countdown / 60)
  const seconds = countdown % 60

  return (
    <div style={{
      border: "1px solid var(--border-base)",
      borderRadius: "8px",
      padding: "12px 16px",
      margin: "8px 0",
      background: "var(--bg-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Text size="small" weight="plus">
          KAMI wants to use <code>{approval.tool}</code>
        </Text>
        <Badge color={riskColor(approval.risk)} size="small">
          {approval.risk}
        </Badge>
        <Text size="xsmall" style={{ color: countdown < 30 ? "var(--fg-error)" : "var(--fg-muted)" }}>
          {minutes}:{seconds.toString().padStart(2, "0")}
        </Text>
      </div>

      <div style={{
        fontSize: "12px",
        color: "var(--fg-muted)",
        marginBottom: 10,
        fontFamily: "monospace",
        background: "var(--bg-component)",
        padding: "6px 8px",
        borderRadius: 4,
        maxHeight: 60,
        overflow: "hidden",
      }}>
        {formatArgs(approval.args) || "(no arguments)"}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Text size="xsmall">Scope:</Text>
        {(["once", "session", "always"] as const).map((s) => (
          <label key={s} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
            <input
              type="radio"
              name={`scope-${approval.id}`}
              checked={scope === s}
              onChange={() => setScope(s)}
              style={{ margin: 0 }}
            />
            {s === "once" ? "Once" : s === "session" ? "Session" : "Always"}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="primary"
          size="small"
          onClick={() => handleDecide(true)}
          disabled={deciding}
          style={{ background: "var(--bg-interactive-primary)" }}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={() => handleDecide(false)}
          disabled={deciding}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
