/**
 * ArtifactPanel — Right-side resizable panel for reports and artifacts.
 *
 * Inspired by LibreChat's Artifacts panel: tabs for different views,
 * incremental section rendering, and export support.
 */

import { Button, IconButton, Text } from "@medusajs/ui"
import { XMark } from "@medusajs/icons"
import { ArtifactSectionRender } from "./ArtifactSectionRender"

type ArtifactPanelProps = {
  open: boolean
  title?: string
  artifactId?: string | null
  sections?: any[]
  generatedAt?: string
  dateRange?: { from: string; to: string; label: string }
  onClose: () => void
  onExport?: (artifactId: string) => void
}

export const ArtifactPanel = ({
  open,
  title,
  artifactId,
  sections = [],
  generatedAt,
  dateRange,
  onClose,
  onExport,
}: ArtifactPanelProps) => {
  if (!open) return null

  const handleExport = () => {
    if (artifactId && onExport) {
      onExport(artifactId)
    }
  }

  return (
    <div style={{
      width: 420,
      minWidth: 320,
      maxWidth: "50vw",
      borderLeft: "1px solid var(--border-base)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-base)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-subtle)",
      }}>
        <div>
          <Text size="small" weight="plus">{title || "Report"}</Text>
          {dateRange && (
            <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
              {dateRange.label}
            </Text>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {artifactId && (
            <Button size="small" variant="secondary" onClick={handleExport}>
              Export
            </Button>
          )}
          <IconButton size="small" variant="transparent" onClick={onClose}>
            <XMark />
          </IconButton>
        </div>
      </div>

      {/* Sections */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 14px",
      }}>
        {sections.length === 0 && (
          <Text size="small" style={{ color: "var(--fg-muted)", textAlign: "center", padding: 20 }}>
            Building report...
          </Text>
        )}
        {sections.map((section: any, i: number) => (
          <ArtifactSectionRender key={`${section.type}-${i}`} section={section} index={i} />
        ))}
      </div>

      {/* Footer */}
      {generatedAt && (
        <div style={{
          padding: "6px 14px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-subtle)",
        }}>
          <Text size="xsmall" style={{ color: "var(--fg-muted)" }}>
            Generated {new Date(generatedAt).toLocaleString()}
          </Text>
        </div>
      )}
    </div>
  )
}
