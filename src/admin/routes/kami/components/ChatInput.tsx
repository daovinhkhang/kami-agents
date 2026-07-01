/**
 * ChatInput — message input with send button, voice toggle, and stop button.
 */

import { Button, IconButton, Textarea } from "@medusajs/ui"
import { PaperPlane, XCircle } from "@medusajs/icons"
import { useCallback, useRef, useEffect } from "react"

type ChatInputProps = {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  onStop: () => void
  isStreaming: boolean
  isVoiceMode: boolean
  onToggleVoice: () => void
  disabled?: boolean
  placeholder?: string
}

export const ChatInput = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  isVoiceMode,
  onToggleVoice,
  disabled,
  placeholder = "Ask KAMI...",
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isStreaming) {
        onSend()
      }
    }
  }, [value, isStreaming, onSend])

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  return (
    <div style={{
      display: "flex",
      gap: 8,
      alignItems: "flex-end",
      padding: "10px 14px",
      borderTop: "1px solid var(--border-base)",
      background: "var(--bg-base)",
    }}>
      <IconButton
        size="small"
        variant={isVoiceMode ? "primary" : "transparent"}
        onClick={onToggleVoice}
        disabled={disabled}
        style={{ fontSize: 14, fontWeight: 700 }}
      >
        {isVoiceMode ? "■" : "▶"}
      </IconButton>

      <div style={{ flex: 1 }}>
        <Textarea
          ref={textareaRef as any}
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || isStreaming}
          style={{
            resize: "none",
            minHeight: 36,
            maxHeight: 120,
          }}
        />
      </div>

      {isStreaming ? (
        <IconButton
          size="small"
          variant="primary"
          onClick={onStop}
        >
          <XCircle />
        </IconButton>
      ) : (
        <IconButton
          size="small"
          variant="primary"
          onClick={onSend}
          disabled={disabled || !value.trim()}
        >
          <PaperPlane />
        </IconButton>
      )}
    </div>
  )
}
