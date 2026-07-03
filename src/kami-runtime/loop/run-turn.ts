import { getKamiConfig } from "../config"
import { compressMessages } from "../context/compress"
import { estimateTokens } from "../context/tokens"
import { completeWithDeepSeek } from "../provider/deepseek"
import {
  getCurrentModel,
  maybeSwitchToFallback,
} from "../provider/healthcheck"
import { buildSystemPrompt } from "../prompt/builder"
import { dispatchTool, checkApproval, waitForApproval, stableArgsKey, resolveEffectiveRisk } from "../tools/dispatcher"
import {
  getTool,
  toolDefinitions,
  type ArgValidationResult,
} from "../tools/registry"
import { ensureToolsRegistered } from "../tools/toolsets"
import { diagnoseMedusaError } from "../tools/medusa/error-diagnostics"
import {
  buildReportArtifactPayload,
  createAndPersistArtifact,
  shouldCreateArtifact,
} from "../report/artifact-builder"
import { buildQuickActions } from "../report/quick-actions"
import type {
  KamiChatMessage,
  KamiCtx,
  KamiEvent,
  KamiProviderToolCall,
  KamiToolCall,
  KamiToolResult,
  TurnInput,
} from "../types"
import { ActiveLoops } from "./active-loops"
import { buildExecutionContext } from "../security/execution-context"
import { consolidateFromSession } from "../skills/improve"

const titleFromMessage = (message: string) => {
  return message.trim().slice(0, 80) || "KAMI session"
}

/**
 * Turn anything thrown by the loop / provider / tools into a readable string.
 * The OpenAI SDK and some Medusa step failures reject with plain objects, so a
 * naive `String(error)` would hide them as "[object Object]". For production
 * observability we render the message + cause + stack + JSON where possible.
 */
const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    const cause =
      error && typeof error === "object" && "cause" in error && error.cause
        ? ` (cause: ${describeError((error as any).cause)})`
        : ""
    return `${error.name}: ${error.message}${cause}`
  }

  if (typeof error === "string") {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const normalizeMessage = (message: any): KamiChatMessage => ({
  role: message.role,
  content: message.content ?? "",
  tool_call_id: message.tool_call_id ?? undefined,
  tool_calls: message.tool_calls ?? undefined,
  contentParts: message.content_parts ?? undefined,
})

const toProviderToolCall = (call: KamiToolCall): KamiProviderToolCall => ({
  id: call.id,
  type: "function",
  function: {
    name: call.name,
    arguments: JSON.stringify(call.arguments ?? {}),
  },
})

const traceLabel = (tool: string) => tool.replace(/_/g, " ")

/** Max identical failed retries before the guardrail forces a strategy change. */
const GUARDRAIL_MAX_IDENTICAL = 2

/** Build the guardrail "stop retrying" diagnostic fed back to the model. */
const buildGuardrailResult = (
  tool: string,
  attempts: number
): ArgValidationResult => ({
  error: true,
  diagnosed: true,
  pattern: "guardrail-repeat",
  root_cause: `The exact same call to "${tool}" with identical arguments has already failed ${attempts} times this turn.`,
  fix: "Change the approach: ask the user for the missing value (ask_user), inspect the data first with graph() tools, or create a draft for review.",
  recoverable: true,
  instruction_to_model:
    `STOP retrying "${tool}" with the same arguments — you have tried ${attempts} times and it keeps failing. ` +
    `Either ask the user for the correct value via ask_user, or change the arguments substantively.`,
})

const createSession = async (input: TurnInput, ctx: Omit<KamiCtx, "sessionId" | "executor">) => {
  if (input.sessionId) {
    try {
      return await ctx.kami.retrieveKamiSession(input.sessionId)
    } catch {
      // Session was deleted — create a fresh one so the turn doesn't crash.
      // The caller (cron tick, gateway, etc.) is responsible for updating
      // any stale session_id reference it holds.
    }
  }

  const [session] = await ctx.kami.createKamiSessions([
    {
      title: titleFromMessage(input.message),
      source: input.source ?? "admin",
      user_id: input.userId ?? null,
      status: "active",
      message_count: 0,
    },
  ])

  return session
}

const incrementMessageCount = async (ctx: KamiCtx, count: number) => {
  const session = await ctx.kami.retrieveKamiSession(ctx.sessionId)

  await ctx.kami.updateKamiSessions({
    id: ctx.sessionId,
    message_count: (session.message_count ?? 0) + count,
  })
}

const persistMessage = async (
  ctx: KamiCtx,
  message: KamiChatMessage,
  metadata?: Record<string, unknown>
) => {
  const [created] = await ctx.kami.createKamiMessages([
    {
      session_id: ctx.sessionId,
      role: message.role,
      content: message.content,
      tool_calls: message.tool_calls ?? null,
      tool_call_id: message.tool_call_id ?? null,
      reasoning: metadata?.reasoning ?? null,
      content_parts: message.contentParts ?? null,
      metadata: metadata ?? null,
    } as any,
  ])

  await incrementMessageCount(ctx, 1)

  return created
}

/**
 * Transient errors that warrant a single retry (possibly with fallback model).
 * 429 = rate-limited, 5xx = server-side, network/timeout = connectivity.
 * Non-retryable: 400 (bad request), 401 (unauthorized), 402 (insufficient
 * funds), 413 (too large).
 */
const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  const err = error as any

  // OpenAI SDK errors carry `status` (HTTP) or `code` (e.g. "rate_limit_exceeded").
  if (err.status === 429 || err.code === "rate_limit_exceeded") {
    return true
  }

  if (typeof err.status === "number" && err.status >= 500) {
    return true
  }

  // Network / timeout errors without a status code.
  if (
    err.code === "ENOTFOUND" ||
    err.code === "ECONNREFUSED" ||
    err.code === "ETIMEDOUT" ||
    err.message?.includes("timeout") ||
    err.message?.includes("fetch failed")
  ) {
    return true
  }

  return false
}

/**
 * Call `completeWithDeepSeek` with retry + fallback-model switching.
 * Retries up to `config.maxRetries` times with exponential backoff for
 * transient errors. After 2 consecutive failures tries the fallback model.
 */
const completeWithRetry = async (
  input: Parameters<typeof completeWithDeepSeek>[0],
  iteration: number
): ReturnType<typeof completeWithDeepSeek> => {
  const { config } = input
  let lastError: unknown = null
  let modelOverride = input.modelOverride ?? getCurrentModel()

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // The first attempt may already carry a modelOverride from a previous
      // fallback switch; subsequent retries inject their own.
      return await completeWithDeepSeek({
        ...input,
        modelOverride,
      })
    } catch (error) {
      lastError = error

      if (attempt >= config.maxRetries || !isRetryableError(error)) {
        throw error
      }

      // After 2 consecutive failures, try the fallback model.
      if (attempt >= 1) {
        modelOverride = maybeSwitchToFallback()
      }

      const delay = config.retryDelayMs * Math.pow(2, attempt)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

const loadHistory = async (ctx: KamiCtx) => {
  const messages = await ctx.kami.listKamiMessages(
    { session_id: ctx.sessionId },
    { take: 100, order: { created_at: "ASC" } }
  )

  return messages.map(normalizeMessage)
}

export async function* runTurn(
  input: TurnInput,
  baseCtx: {
    scope: KamiCtx["scope"]
    kami: KamiCtx["kami"]
  }
): AsyncGenerator<KamiEvent> {
  ensureToolsRegistered()

  const config = {
    ...getKamiConfig(),
    ...(input.model ? { model: input.model } : {}),
  }
  const session = await createSession(input, {
    ...baseCtx,
    config,
    toolset: input.toolset ?? "admin",
    userId: input.userId,
  })
  const ctx: KamiCtx = {
    ...baseCtx,
    config,
    sessionId: session.id,
    userId: input.userId,
    toolset: input.toolset ?? "admin",
    executor: buildExecutionContext({
      scope: baseCtx.scope,
      sessionId: session.id,
      userId: input.userId,
    }),
  }

  yield { type: "session", session_id: ctx.sessionId }

  if (config.halt) {
    yield { type: "done", reason: "halted_by_env" }
    return
  }

  const cancel = ActiveLoops.register(ctx.sessionId)

  let completed = false
  const turnToolResults: KamiToolResult[] = []
  let emittedArtifactId: string | undefined
  let autonomousMutationCount = 0
  let traceIndex = 0
  // Per-turn guardrail: counts identical (name+args) failed calls so the model
  // can't loop on the same malformed/rejected call indefinitely.
  const failedCallCounts = new Map<string, number>()

  try {
    await persistMessage(ctx, {
      role: "user",
      content: input.message,
    })

    let messages: KamiChatMessage[] = [
      { role: "system", content: await buildSystemPrompt(ctx) },
      ...(await loadHistory(ctx)),
    ]

    let iteration = 0
    while (iteration++ < config.maxIterations && !cancel.aborted) {
      if (estimateTokens(messages) > config.contextLimit * 0.85) {
        messages = compressMessages(messages)
      }

      const completion = await completeWithRetry(
        {
          config,
          messages,
          tools: toolDefinitions(ctx.toolset),
        },
        iteration
      )

      if (completion.reasoning) {
        yield { type: "reasoning_delta", delta: completion.reasoning }
      }

      if (completion.text) {
        yield { type: "text_delta", delta: completion.text }
      }

      if (!completion.toolCalls.length) {
        const parts: KamiChatMessage["contentParts"] = []
        if (completion.reasoning) {
          parts.push({ type: "think" as const, think: completion.reasoning })
        }
        if (completion.text) {
          parts.push({ type: "text" as const, text: completion.text })
        }
        await persistMessage(
          ctx,
          { role: "assistant", content: completion.text, contentParts: parts },
          {
            reasoning: completion.reasoning ?? null,
            usage: completion.usage ?? null,
            artifact_id: emittedArtifactId ?? null,
          }
        )
        completed = true

        if (!emittedArtifactId && shouldCreateArtifact(input.message, turnToolResults)) {
          const payload = buildReportArtifactPayload({
            userMessage: input.message,
            results: turnToolResults,
          })
          const artifact = await createAndPersistArtifact(ctx.kami, ctx.sessionId, payload)
          emittedArtifactId = artifact.id
          yield { type: "artifact_done", artifact_id: artifact.id, payload }
        }

        const actions = buildQuickActions({
          sessionId: ctx.sessionId,
          artifactId: emittedArtifactId,
          userMessage: input.message,
          results: turnToolResults,
        })
        if (actions.length) {
          yield { type: "quick_actions", actions }
        }

        yield { type: "done", text: completion.text }
        return
      }

      const assistantParts: KamiChatMessage["contentParts"] = []
      if (completion.reasoning) {
        assistantParts.push({ type: "think" as const, think: completion.reasoning })
      }
      if (completion.text) {
        assistantParts.push({ type: "text" as const, text: completion.text })
      }
      for (const c of completion.toolCalls) {
        assistantParts.push({ type: "tool_call" as const, tool_name: c.name, args: c.arguments })
      }

      const assistantToolMessage: KamiChatMessage = {
        role: "assistant",
        content: completion.text ?? "",
        tool_calls: completion.toolCalls.map(toProviderToolCall),
        contentParts: assistantParts,
      }

      await persistMessage(ctx, assistantToolMessage, {
        reasoning: completion.reasoning ?? null,
        usage: completion.usage ?? null,
      })
      messages.push(assistantToolMessage)

      // ── Process tool calls with error recovery ─────────────────────
      // Track which indices were processed so we can fill remaining ones
      // with placeholder results if an error breaks us out early.
      // The LLM API requires EVERY tool_call_id to have a tool message.
      let toolErrorBreak = false
      for (let callIdx = 0; callIdx < completion.toolCalls.length; callIdx++) {
        if (cancel.aborted) {
          yield { type: "done", reason: "halted" }
          return
        }

        const call = completion.toolCalls[callIdx]
        const entry = getTool(call.name)
        const currentTraceIndex = traceIndex++
        // Effective risk, not the static entry.risk: call_api's real risk
        // depends on its HTTP method, so the badge/limit reason about the same
        // risk the approval gate does.
        const effectiveRisk = entry
          ? resolveEffectiveRisk(entry, call.arguments)
          : "read"
        yield { type: "tool_start", call, risk: entry ? effectiveRisk : "safe" }
        yield {
          type: "trace_step",
          step: {
            index: currentTraceIndex,
            tool: call.name,
            status: "running",
            label: traceLabel(call.name),
          },
        }

        // ── Guardrail: stop the model from retrying the exact same failing call ──
        const callKey = `${call.name}:${stableArgsKey(call.arguments)}`
        const prevFailures = failedCallCounts.get(callKey) ?? 0
        if (prevFailures >= GUARDRAIL_MAX_IDENTICAL) {
          const guardrailResult = buildGuardrailResult(call.name, prevFailures)
          const guardrailText = JSON.stringify(guardrailResult)
          yield { type: "tool_result", call, result: guardrailText }
          yield {
            type: "trace_step",
            step: {
              index: currentTraceIndex,
              tool: call.name,
              status: "error",
              label: traceLabel(call.name),
            },
          }
          const guardrailMsg: KamiChatMessage = {
            role: "tool",
            tool_call_id: call.id,
            content: guardrailText,
          }
          await persistMessage(ctx, guardrailMsg)
          messages.push(guardrailMsg)
          toolErrorBreak = true
          break
        }

        if (
          (effectiveRisk === "mutating" || effectiveRisk === "destructive") &&
          ctx.config.autonomyMaxMutationsPerTurn > 0
        ) {
          if (autonomousMutationCount >= ctx.config.autonomyMaxMutationsPerTurn) {
            const limitResult = JSON.stringify({
              error: true,
              diagnosed: true,
              pattern: "autonomy-mutation-limit",
              root_cause:
                `KAMI reached the configured mutation limit of ${ctx.config.autonomyMaxMutationsPerTurn} tool calls for this turn.`,
              fix:
                "Summarize what has already been completed, then ask the user to approve continuing in a new turn.",
              recoverable: true,
              instruction_to_model:
                "Stop executing more mutating tools in this turn. Explain the completed work and ask the user before continuing.",
            })

            yield { type: "tool_result", call, result: limitResult }
            yield {
              type: "trace_step",
              step: {
                index: currentTraceIndex,
                tool: call.name,
                status: "error",
                label: traceLabel(call.name),
              },
            }

            const limitMsg: KamiChatMessage = {
              role: "tool",
              tool_call_id: call.id,
              content: limitResult,
            }
            await persistMessage(ctx, limitMsg)
            messages.push(limitMsg)
            toolErrorBreak = true
            break
          }

          autonomousMutationCount++
        }

        // ── Approval check (two-phase: yield event → block → continue) ──
        // This runs BEFORE dispatch so the frontend can render ApprovalCard
        // while the turn is paused.
        let skipApprovalForThisCall = false
        try {
          const approvalCheck = await checkApproval(call, ctx)
          if (approvalCheck.needsApproval) {
            if (approvalCheck.alreadyApproved) {
              // Session-scope cache hit — skip approval silently
              skipApprovalForThisCall = true
            } else if (approvalCheck.request) {
              // Phase 1: emit event so frontend renders ApprovalCard
              yield {
                type: "approval_required",
                approval: approvalCheck.request,
                call,
              }

              // Phase 2: block until user decides (or timeout)
              const decision = await waitForApproval(approvalCheck.request, ctx, call)

              if (!decision.approved) {
                // Rejected or timed out — create diagnostic, break to let model process
                const rejectionText = JSON.stringify({
                  error: true,
                  diagnosed: true,
                  pattern: "approval-rejected",
                  root_cause: `Approval was denied for ${call.name}${decision.reason ? `: ${decision.reason}` : "."}`,
                  fix: "Ask the user if they want to proceed differently, or try a read-only alternative.",
                  recoverable: false,
                  instruction_to_model:
                    "The user denied approval for this tool call. Do NOT retry the same call. " +
                    "Explain why you needed it and ask the user what they would like to do instead.",
                })

                yield { type: "tool_result", call, result: rejectionText }
                yield {
                  type: "trace_step",
                  step: {
                    index: currentTraceIndex,
                    tool: call.name,
                    status: "error",
                    label: traceLabel(call.name),
                  },
                }

                const rejectionMsg: KamiChatMessage = {
                  role: "tool",
                  tool_call_id: call.id,
                  content: rejectionText,
                }
                await persistMessage(ctx, rejectionMsg)
                messages.push(rejectionMsg)
                toolErrorBreak = true
                break
              }

              // Approved — continue to dispatch with skipApproval
              skipApprovalForThisCall = true
            }
          }
        } catch (approvalError: any) {
          // Approval gate error — log and continue without approval
          console.error("[kami] Approval gate error:", approvalError?.message ?? approvalError)
        }

        // ── Error recovery: catch tool failures, diagnose, feed back to model ──
        let dispatched: Awaited<ReturnType<typeof dispatchTool>>
        let diagnosticFromResult = false
        try {
          dispatched = await dispatchTool(call, ctx)
          // A validation rejection returns a diagnostic result (not a throw).
          // Count it as a failure so the guardrail can engage on repeats.
          if (
            !dispatched.approvalRequired &&
            dispatched.result &&
            typeof dispatched.result === "object" &&
            (dispatched.result as { error?: unknown }).error === true
          ) {
            diagnosticFromResult = true
          }
        } catch (toolError: any) {
          const diagnosis = diagnoseMedusaError(toolError)
          const errorMessage = describeError(toolError)

          const resultPayload = diagnosis
            ? {
                error: true,
                diagnosed: true,
                raw_error: errorMessage.slice(0, 500),
                diagnosis,
                instruction_to_model:
                  "You now have the diagnosis above. Explain the root cause to the user in plain language, " +
                  "then propose and execute the fix. Use your tools to inspect current state first, " +
                  "then apply the fix. Do NOT just report the error — FIX IT.",
              }
            : {
                error: true,
                diagnosed: false,
                raw_error: errorMessage.slice(0, 500),
                stack: toolError instanceof Error ? (toolError.stack ?? "").slice(0, 500) : "",
                instruction_to_model:
                  "The tool call failed with an unrecognized error. " +
                  "1. Explain what went wrong in plain language. " +
                  "2. If this looks like a data issue, use graph() tools to inspect the relevant entities. " +
                  "3. Propose a fix based on the data model you know. " +
                  "4. If you cannot fix it, clearly state what's blocking and ask the user for guidance.",
              }

          const diagnosticResult = JSON.stringify(resultPayload)
          yield { type: "tool_result", call, result: diagnosticResult }
          yield {
            type: "trace_step",
            step: {
              index: currentTraceIndex,
              tool: call.name,
              status: "error",
              label: traceLabel(call.name),
            },
          }

          const toolMessage: KamiChatMessage = {
            role: "tool",
            tool_call_id: call.id,
            content: diagnosticResult,
          }
          await persistMessage(ctx, toolMessage)
          messages.push(toolMessage)
          failedCallCounts.set(callKey, prevFailures + 1)
          toolErrorBreak = true
          break  // Stop processing remaining tool calls — model must process this error
        }

        yield { type: "tool_result", call, result: dispatched.result }

        if (call.name === "ui_command") {
          yield { type: "ui_command", command: dispatched.result as any }
        }

        if (call.name === "create_artifact") {
          const artifact = dispatched.result as any
          if (artifact?.id && artifact?.payload) {
            emittedArtifactId = artifact.id
            yield { type: "artifact_done", artifact_id: artifact.id, payload: artifact.payload }
          }
        }

        if (call.name === "render_artifact") {
          const artifact = dispatched.result as any
          if (artifact?.id && artifact?.payload) {
            emittedArtifactId = artifact.id
            // Emit incremental delta for each section added
            if (artifact.delta?.sections) {
              for (let si = 0; si < artifact.delta.sections.length; si++) {
                yield {
                  type: "artifact_delta",
                  artifact_id: artifact.id,
                  section_index: si,
                  delta: artifact.delta.sections[si],
                }
              }
            }
            // Always emit a full artifact_done so the panel can reconcile
            yield { type: "artifact_done", artifact_id: artifact.id, payload: artifact.payload }
          }
        }

        if (call.name === "create_commerce_draft") {
          const result = dispatched.result as any
          if (result?.artifact?.id && result?.draft) {
            yield {
              type: "draft_created",
              artifact_id: result.artifact.id,
              draft: result.draft,
              artifact: result.artifact,
            }
            if (result.ui_command) {
              yield { type: "ui_command", command: result.ui_command }
            }
          }
        }

        yield {
          type: "trace_step",
          step: {
            index: currentTraceIndex,
            tool: call.name,
            status: diagnosticFromResult ? "error" : "done",
            label: traceLabel(call.name),
          },
        }
        turnToolResults.push({ call, result: dispatched.result })

        const toolResultText =
          typeof dispatched.result === "string"
            ? dispatched.result
            : JSON.stringify(dispatched.result)

        const toolParts: KamiChatMessage["contentParts"] = [
          { type: "tool_call" as const, tool_name: call.name, args: call.arguments, result: dispatched.result, risk: entry?.risk ?? "safe" },
        ]

        const toolMessage: KamiChatMessage = {
          role: "tool",
          tool_call_id: call.id,
          content: toolResultText,
          contentParts: toolParts,
        }

        await persistMessage(ctx, toolMessage)
        messages.push(toolMessage)

        if (diagnosticFromResult) {
          failedCallCounts.set(callKey, prevFailures + 1)
        }

        if (call.name === "finish") {
          completed = true
          yield { type: "done", text: String(dispatched.result ?? "") }
          return
        }
      }

      // ── Fill remaining tool calls that were skipped due to early break ───
      // Required! The LLM API rejects messages where assistant has tool_calls
      // but not every tool_call_id has a corresponding tool message.
      if (toolErrorBreak) {
        const processedIds = new Set(
          messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id)
        )
        for (const call of completion.toolCalls) {
          if (!processedIds.has(call.id)) {
            const placeholder: KamiChatMessage = {
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({
                skipped: true,
                reason: "An earlier tool call in this batch failed with an error. Fix that error first, then re-run this tool call.",
              }),
            }
            await persistMessage(ctx, placeholder)
            messages.push(placeholder)
          }
        }
      }
    }

    yield {
      type: "done",
      reason: cancel.aborted ? "halted" : "budget_or_iterations",
    }
  } catch (error) {
    yield {
      type: "error",
      message: describeError(error),
    }
  } finally {
    ActiveLoops.unregister(ctx.sessionId)

    // Phase 3: fire-and-forget skill consolidation. Only run when the turn
    // completed successfully (not halted, not errored, not approval-gated).
    if (completed) {
      consolidateFromSession(ctx.sessionId, ctx.kami).catch(() => {
        // Consolidation failures are silent — the background review job
        // will catch up on the next cycle.
      })
    }
  }
}
