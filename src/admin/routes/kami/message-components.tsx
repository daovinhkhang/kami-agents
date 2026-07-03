import { Badge, Copy, Text } from "@medusajs/ui"
import {
  ChevronDownMini,
  ExclamationCircle,
  LightBulb,
} from "@medusajs/icons"
import { useState } from "react"
import type { ChatMessage, ContentPart, QuickAction, Row, UiCommand } from "./types"
import {
  kindIcon,
  relativeTime,
  riskColor,
  safeJson,
  toolArgChips,
  toolIcon,
  toolLabel,
  toolTarget,
} from "./helpers"
import { KamiMarkdown } from "./markdown"
import {
  InlineApprovalCard,
  InlineArtifactCard,
  InlineDraftCard,
  InlineUiCommandCard,
} from "./inline-cards"

/* ------------------------------------------------------------------ */
/*  Rich tool rendering                                                */
/*  Some tools emit structured UI (a report, a draft, a focus card)    */
/*  that opencode-style renders inline in the chat stream rather than  */
/*  in a side panel. Everything else renders as a plain ToolCard.      */
/* ------------------------------------------------------------------ */

const RICH_TOOL_NAMES = [
  "create_artifact",
  "render_artifact",
  "create_commerce_draft",
  "ui_command",
]

// A rich tool only becomes a card once it has a result to render. While it's
// still running (result === undefined) it stays a plain ToolCard with a spinner.
const isRichTool = (tool: ContentPart & { type: "tool_call" }) =>
  RICH_TOOL_NAMES.includes(tool.tool_name) && tool.result !== undefined

type DraftHandlers = {
  drafts?: Row[]
  onSaveDraft: (draft: Row, args: Row) => Promise<Row | null>
  onExecuteDraft: (draft: Row, args: Row) => Promise<void>
  onDismissDraft: (draft: Row) => Promise<void>
}

const RichToolCard = ({
  tool,
  drafts,
  onSaveDraft,
  onExecuteDraft,
  onDismissDraft,
}: { tool: ContentPart & { type: "tool_call" } } & DraftHandlers) => {
  const result = tool.result as any
  const name = tool.tool_name

  if (name === "create_artifact" || name === "render_artifact") {
    if (!result?.payload) return null
    return <InlineArtifactCard artifactId={result.id} payload={result.payload} />
  }

  if (name === "create_commerce_draft") {
    const draftId = result?.artifact?.id
    if (!result?.draft || !draftId) return null
    const liveDraft = drafts?.find((item) => item.id === draftId)
    return (
      <InlineDraftCard
        artifactId={draftId}
        payload={result.draft}
        liveDraft={liveDraft}
        onSave={onSaveDraft}
        onExecute={onExecuteDraft}
        onDismiss={onDismissDraft}
      />
    )
  }

  if (name === "ui_command") {
    const command = result as UiCommand
    // Navigation commands (open_drawer/open_artifact/open_draft) are handled by
    // the page; only the "focus/highlight/confirm" variants carry a card body.
    if (!command || !["focus_record", "highlight_issue", "request_confirmation"].includes(command.action)) {
      return null
    }
    return <InlineUiCommandCard command={command} />
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  Message Components                                                 */
/* ------------------------------------------------------------------ */

// A small chevron that rotates when its collapsible is open.
const Chevron = ({ open }: { open: boolean }) => (
  <ChevronDownMini
    className={`shrink-0 text-ui-fg-muted transition-transform duration-150 ${open ? "" : "-rotate-90"}`}
  />
)

// Collapsible "Thinking" block — the model's reasoning, rendered as markdown.
// Mirrors opencode's reasoning card: quiet by default, expandable.
const ThinkingBlock = ({ thought, active }: { thought: string; active?: boolean }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle kami-fade-in">
      <button
        type="button"
        className="flex w-full items-center gap-x-2 px-3 py-2 text-left hover:bg-ui-bg-base-hover"
        onClick={() => setOpen(!open)}
      >
        <LightBulb className="shrink-0 text-ui-fg-muted" />
        <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
          {active ? "Thinking" : "Thought"}
        </Text>
        {active && (
          <span className="flex gap-0.5">
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
            <span className="inline-block size-1 rounded-full bg-ui-fg-muted kami-thinking-dot" />
          </span>
        )}
        <span className="ml-auto">
          <Chevron open={open} />
        </span>
      </button>
      {open && (
        <div className="border-t border-ui-border-base px-3 py-2.5">
          <Text
            size="xsmall"
            className="max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed text-ui-fg-subtle"
          >
            {thought}
          </Text>
        </div>
      )}
    </div>
  )
}

// A single tool call rendered as a collapsible card, opencode-style:
// icon + clean title + target + arg chips in the header; args/result in the body.
const ToolCard = ({
  tool,
  active,
}: {
  tool: ContentPart & { type: "tool_call" }
  active?: boolean
}) => {
  const pending = tool.result === undefined
  const running = Boolean(active && pending)
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(tool.tool_name)
  const target = toolTarget(tool.args)
  const chips = toolArgChips(tool.args)

  return (
    <div className="overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-base kami-fade-in">
      <button
        type="button"
        className="flex w-full items-center gap-x-2 px-3 py-2 text-left hover:bg-ui-bg-base-hover"
        onClick={() => setOpen(!open)}
      >
        {running ? (
          <span className="kami-spinner" />
        ) : (
          <Icon className="shrink-0 text-ui-fg-subtle" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-x-2">
          <Text size="xsmall" weight="plus" className="shrink-0 text-ui-fg-base">
            {toolLabel(tool.tool_name)}
          </Text>
          {target && (
            <Text size="xsmall" className="truncate font-mono text-ui-fg-subtle">
              {target}
            </Text>
          )}
          {chips.slice(0, 2).map((chip, i) => (
            <span
              key={i}
              className="hidden shrink-0 rounded bg-ui-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ui-fg-muted sm:inline"
            >
              {chip}
            </span>
          ))}
        </div>
        <Badge size="2xsmall" color={riskColor(tool.risk)}>
          {tool.risk ?? "safe"}
        </Badge>
        {running && (
          <Text size="xsmall" className="text-ui-fg-interactive">
            running
          </Text>
        )}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-ui-border-base px-3 py-2.5">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <Text size="xsmall" weight="plus" className="mb-1 text-ui-fg-muted">
                Input
              </Text>
              <pre className="max-h-48 overflow-auto rounded bg-ui-bg-subtle px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ui-fg-subtle">
                {safeJson(tool.args)}
              </pre>
            </div>
          )}
          {!pending && (
            <div>
              <Text size="xsmall" weight="plus" className="mb-1 text-ui-fg-muted">
                Result
              </Text>
              <pre className="max-h-64 overflow-auto rounded bg-ui-bg-subtle px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ui-fg-subtle">
                {typeof tool.result === "string" ? tool.result : safeJson(tool.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Renders the reasoning + tool timeline for an assistant turn as a flat stack
// of cards (thinking first, then each tool), matching opencode's clean layout.
const ExecutionTrace = ({
  thought,
  tools,
  isStreaming,
  draftHandlers,
}: {
  thought?: string
  tools: Array<ContentPart & { type: "tool_call" }>
  isStreaming?: boolean
  draftHandlers: DraftHandlers
}) => {
  const active = Boolean(isStreaming && (thought || tools.some((tool) => tool.result === undefined)))

  if (!thought && tools.length === 0) return null

  return (
    <div className="my-1.5 w-full space-y-1.5">
      {thought && <ThinkingBlock thought={thought} active={active && !tools.length} />}
      {tools.map((tool, i) =>
        isRichTool(tool) ? (
          <RichToolCard key={`${tool.tool_name}-${i}`} tool={tool} {...draftHandlers} />
        ) : (
          <ToolCard key={`${tool.tool_name}-${i}`} tool={tool} active={active} />
        )
      )}
    </div>
  )
}

const AssistantLoading = () => (
  <div className="flex items-center gap-x-1.5 py-1.5">
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
    <span className="inline-block size-1.5 rounded-full bg-ui-fg-muted kami-thinking-dot" />
  </div>
)

// Dedicated error card with a copy button, opencode's ToolErrorCard-style.
const ErrorBlock = ({ error }: { error: string }) => {
  const cleaned = error.replace(/^Error:\s*/, "").trim()
  const [head, ...restParts] = cleaned.split(": ")
  const hasSplit = restParts.length > 0
  const subtitle = hasSplit ? head.trim() : "Failed"
  const body = hasSplit ? restParts.join(": ").trim() : cleaned

  return (
    <div className="overflow-hidden rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg kami-fade-in">
      <div className="flex items-start gap-x-2 px-3 py-2">
        <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-red-icon" />
        <div className="min-w-0 flex-1">
          <Text size="xsmall" weight="plus" className="text-ui-tag-red-text">
            {subtitle}
          </Text>
          {body && (
            <Text size="xsmall" className="mt-0.5 whitespace-pre-wrap break-words text-ui-tag-red-text opacity-90">
              {body}
            </Text>
          )}
        </div>
        <Copy content={cleaned} className="shrink-0 text-ui-tag-red-text" />
      </div>
    </div>
  )
}

const QuickActionCards = ({
  actions,
  onAction,
}: {
  actions?: QuickAction[]
  onAction: (action: QuickAction) => Promise<void>
}) => {
  if (!actions?.length) return null

  return (
    <div className="pt-1">
      <div className="mb-1.5 flex items-center gap-x-1.5 px-0.5">
        <LightBulb className="text-ui-fg-muted" />
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
          Đề xuất tiếp theo
        </Text>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {actions.map((action, index) => {
          const Icon = kindIcon(action.kind)
          return (
            <button
              key={`${action.tool}-${index}`}
              className="group flex items-start gap-x-2.5 rounded-lg border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-left transition-colors hover:border-ui-border-interactive hover:bg-ui-bg-base-hover"
              onClick={() => onAction(action)}
            >
              <span className="mt-0.5 shrink-0 text-ui-fg-muted transition-colors group-hover:text-ui-fg-interactive">
                <Icon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-x-2">
                  <Text
                    size="xsmall"
                    weight="plus"
                    className="truncate text-ui-fg-base"
                  >
                    {action.label}
                  </Text>
                  <Badge size="2xsmall" color={riskColor(action.risk)}>
                    {action.kind}
                  </Badge>
                </div>
                {action.description && (
                  <Text
                    size="xsmall"
                    className="mt-0.5 line-clamp-2 text-ui-fg-subtle"
                  >
                    {action.description}
                  </Text>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const ChatMessageBubble = ({
  msg,
  isStreaming,
  onQuickAction,
  drafts,
  onSaveDraft,
  onExecuteDraft,
  onDismissDraft,
  onDecideApproval,
}: {
  msg: ChatMessage
  isStreaming?: boolean
  onQuickAction: (action: QuickAction) => Promise<void>
  drafts?: Row[]
  onSaveDraft: (draft: Row, args: Row) => Promise<Row | null>
  onExecuteDraft: (draft: Row, args: Row) => Promise<void>
  onDismissDraft: (draft: Row) => Promise<void>
  onDecideApproval: (id: string, status: "approved" | "rejected") => Promise<void>
}) => {
  const isUser = msg.role === "user"
  const isTool = msg.role === "tool"
  const parts: ContentPart[] = msg.content_parts ?? []
  const thought = parts.find((p) => p.type === "think")?.think
  const tools = parts.filter((p) => p.type === "tool_call") as Array<ContentPart & { type: "tool_call" }>
  const approvals = parts.filter((p) => p.type === "approval") as Array<ContentPart & { type: "approval" }>
  const draftHandlers: DraftHandlers = { drafts, onSaveDraft, onExecuteDraft, onDismissDraft }

  if (isTool) {
    if (approvals.length) {
      return (
        <div className="flex justify-start pl-8 kami-msg-enter">
          <div className="w-full max-w-full space-y-1">
            {approvals.map((part, i) => (
              <InlineApprovalCard
                key={i}
                approval={part.approval}
                decided={part.decided}
                onDecide={onDecideApproval}
              />
            ))}
          </div>
        </div>
      )
    }

    if (parts.some((part) => part.type === "error")) {
      return (
        <div className="flex justify-start pl-8 kami-msg-enter">
          <div className="w-full max-w-full space-y-1">
            {parts.filter((part) => part.type === "error").map((part, i) => (
              <ErrorBlock key={i} error={(part as any).error} />
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} kami-msg-enter`}>
      <div className={`kami-msg-bubble flex gap-x-3 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        {/* Avatar */}
        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full mt-0.5 ${isUser ? "bg-ui-tag-blue-bg" : "bg-ui-tag-purple-bg"}`}>
          <Text size="xsmall" weight="plus" className={isUser ? "text-ui-tag-blue-text" : "text-ui-tag-purple-text"}>
            {isUser ? "U" : "K"}
          </Text>
        </div>

        {/* Content */}
        <div className={`flex min-w-0 flex-1 flex-col space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
          <ExecutionTrace thought={thought} tools={tools} isStreaming={isStreaming} draftHandlers={draftHandlers} />

          {/* Text content */}
          {isUser ? (
            <div className="max-w-full rounded-2xl rounded-tr-sm bg-ui-tag-blue-bg px-3.5 py-2">
              <Text size="small" className="whitespace-pre-wrap break-words text-ui-tag-blue-text">
                {msg.content}
              </Text>
            </div>
          ) : msg.content ? (
            <div className="max-w-full overflow-hidden rounded-2xl rounded-tl-sm border border-ui-border-base bg-ui-bg-base px-3.5 py-2">
              <KamiMarkdown text={msg.content} />
              {isStreaming && <span className="kami-stream-caret text-ui-fg-interactive" />}
            </div>
          ) : (
            // No text yet. Only show the loading dots when nothing else is
            // rendered (no thinking, no tools) so we don't stack a redundant
            // empty bubble under the tool cards. Once the turn is done with no
            // text (tools-only turn), render nothing instead of an empty box.
            isStreaming && !thought && tools.length === 0 && (
              <div className="rounded-2xl rounded-tl-sm border border-ui-border-base bg-ui-bg-base px-3.5 py-2">
                <AssistantLoading />
              </div>
            )
          )}

          {parts.filter((p) => p.type === "error").map((part, i) => (
            <ErrorBlock key={i} error={(part as any).error} />
          ))}

          {/* Timestamp on hover */}
          {msg.created_at && (
            <Text size="xsmall" className="text-ui-fg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {relativeTime(msg.created_at)}
            </Text>
          )}

          {!isUser && (
            <QuickActionCards
              actions={msg.metadata?.quick_actions as QuickAction[] | undefined}
              onAction={onQuickAction}
            />
          )}
        </div>
      </div>
    </div>
  )
}
