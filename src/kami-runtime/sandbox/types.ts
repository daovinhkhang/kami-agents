/**
 * Sandbox execution interfaces for code-exec tool (Phase 5).
 *
 * KAMI can execute code in an isolated Docker container. The sandbox
 * is strictly opt-in (`KAMI_SANDBOX_ENABLED=true`). Without a sandbox,
 * the code_exec tool refuses to run — there is no host-level fallback.
 */
export type SandboxResult = {
  /** Combined stdout + stderr from the executed code. */
  output: string
  /** Exit code of the process inside the container (0 = success). */
  exitCode: number
  /** Wall-clock execution time in milliseconds. */
  durationMs: number
  /** Whether the execution was terminated by timeout. */
  timedOut: boolean
}

export type SandboxOptions = {
  /** Programming language runtime (e.g. "python", "node", "bash"). */
  language: string
  /** Source code to execute. */
  code: string
  /** Max execution time in milliseconds (default 30s). */
  timeoutMs?: number
  /** Max memory in MB (default 128). */
  memoryLimitMb?: number
  /** Environment variables to pass into the container. */
  env?: Record<string, string>
}

export interface SandboxProvider {
  /** Unique id for this sandbox backend. */
  readonly id: string

  /** Whether the sandbox is currently reachable and healthy. */
  healthcheck(): Promise<boolean>

  /** Execute code and return the result. */
  run(options: SandboxOptions): Promise<SandboxResult>
}
