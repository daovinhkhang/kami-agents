import type { Context, MedusaContainer } from "@medusajs/framework/types"
import type { KamiCtx } from "../types"

/**
 * KAMI's privileged execution scope — the concrete realization of
 * "superuser / max permission".
 *
 * KAMI never calls Medusa through the HTTP layer, so no permission / RBAC
 * middleware ever runs against its actions. Instead it invokes Medusa
 * workflows & services directly via the container, acting as a privileged
 * SYSTEM actor (KAMI itself, or the human admin who initiated the turn).
 *
 * Every tool handler receives this executor on `ctx.executor` and is expected
 * to route mutating commerce operations through `executor.runWorkflow(...)` so
 * that KAMI's identity is stamped on the Medusa `Context` and the audit log —
 * there is no path that bypasses it.
 */
export type KamiActor = {
  /** Stable privileged actor id. "kami" unless impersonating the admin who started the turn. */
  id: string
  /** KAMI is a system actor, not an end-user or customer. */
  type: "kami"
  /** Privileged by construction: server-side invocation skips HTTP/RBAC auth. */
  superuser: true
}

type WorkflowLike = (scope: MedusaContainer) => {
  run(args?: {
    input?: unknown
    context?: Context
    throwOnError?: boolean
  }): Promise<{ result: unknown; errors?: unknown[] }>
}

export type KamiExecutionContext = {
  actor: KamiActor
  scope: MedusaContainer

  /**
   * Medusa `Context` attached to every workflow / service call. Carries a
   * requestId (= `kami:<session>`) for cross-module tracing, plus KAMI's actor
   * metadata so steps that consume `context.actorId` resolve to KAMI.
   */
  context: Context

  isSuperuser: true

  /** Resolve a module service by registration key, e.g. `Modules.PRODUCT`. */
  resolveModule: <T = unknown>(key: string) => T

  /**
   * Run a core-flows workflow with KAMI's superuser context attached.
   * Centralizes privilege so mutating tool handlers always go through one
   * audited, context-stamped path instead of calling workflows ad hoc.
   */
  runWorkflow: <TResult = unknown>(
    workflow: WorkflowLike,
    input: unknown,
    options?: { throwOnError?: boolean }
  ) => Promise<TResult>
}

const SYSTEM_ACTOR: KamiActor = {
  id: "kami",
  type: "kami",
  superuser: true,
}

/**
 * Build the privileged KAMI execution scope for a turn. Called once per turn
 * inside `runTurn` (and once more when an approval is executed), then attached
 * to the shared `ctx` so every tool handler shares the same superuser identity
 * + Medusa context.
 *
 * @param scope       The Medusa container (req.scope / job container).
 * @param sessionId   Active KAMI session, used as the trace requestId.
 * @param userId      Optional admin actor_id that initiated the turn. When
 *                    present KAMI impersonates that human for audit purposes;
 *                    otherwise it acts as the bare "kami" system actor.
 */
export const buildExecutionContext = (input: {
  scope: KamiCtx["scope"]
  sessionId: string
  userId?: string
}): KamiExecutionContext => {
  const actor: KamiActor = {
    id: input.userId ?? SYSTEM_ACTOR.id,
    type: "kami",
    superuser: true,
  }

  const context: Context = {
    __type: "MedusaContext",
    requestId: `kami:${input.sessionId}`,
    // Actor metadata consumed by Medusa flows/steps that read context.actorId
    // / loggedInUserId (extra keys are harmless to steps that do not).
    ...({
      actorId: actor.id,
      actorType: actor.type,
      loggedInUserId: actor.id,
    } as Record<string, unknown>),
  } as Context

  const runWorkflow: KamiExecutionContext["runWorkflow"] = async (
    workflow,
    runInput,
    options
  ) => {
    const runResult = await workflow(input.scope).run({
      input: runInput,
      context,
      throwOnError: options?.throwOnError ?? true,
    })

    return runResult.result as any
  }

  const resolveModule: KamiExecutionContext["resolveModule"] = (key) =>
    input.scope.resolve(key) as any

  return {
    actor,
    scope: input.scope,
    context,
    isSuperuser: true,
    runWorkflow,
    resolveModule,
  }
}
