import type { SandboxOptions, SandboxProvider, SandboxResult } from "./types"
import { execSync } from "node:child_process"

/**
 * Docker-based sandbox for code execution.
 *
 * Uses a minimal Alpine image with the requested language runtime.
 * Each execution:
 *   1. Pulls the image if missing.
 *   2. Runs `docker run --rm` with CPU/memory limits, read-only rootfs,
 *      no network, and a 30s timeout.
 *   3. Captures stdout + stderr, returns exit code + timing.
 *
 * Security: --read-only, --network=none, --memory, --cpus, --pids-limit,
 *           --security-opt=no-new-privileges, drop all capabilities.
 */
export class DockerSandbox implements SandboxProvider {
  readonly id = "docker"

  readonly #image: string
  readonly #networkDisabled: boolean
  readonly #readOnlyRootfs: boolean

  constructor(options?: {
    image?: string
    networkDisabled?: boolean
    readOnlyRootfs?: boolean
  }) {
    this.#image = options?.image ?? "alpine:3.20"
    this.#networkDisabled = options?.networkDisabled ?? true
    this.#readOnlyRootfs = options?.readOnlyRootfs ?? true
  }

  async healthcheck(): Promise<boolean> {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  async run(options: SandboxOptions): Promise<SandboxResult> {
    const timeout = options.timeoutMs ?? 30_000
    const memoryLimit = options.memoryLimitMb ?? 128
    const language = options.language.toLowerCase()

    const image = this.resolveImage(language)
    const command = this.buildCommand(language, options.code)

    const dockerArgs = [
      "run",
      "--rm",
      `--memory=${memoryLimit}m`,
      "--cpus=0.5",
      "--pids-limit=64",
      "--security-opt=no-new-privileges",
      "--cap-drop=ALL",
      ...(this.#networkDisabled ? ["--network=none"] : []),
      ...(this.#readOnlyRootfs ? ["--read-only", "--tmpfs=/tmp:rw,noexec,nosuid,size=64M"] : []),
      ...(options.env
        ? Object.entries(options.env).flatMap(([k, v]) => ["-e", `${k}=${v}`])
        : []),
      image,
      ...command,
    ]

    const start = Date.now()
    let timedOut = false

    try {
      const stdout = execSync("docker " + dockerArgs.join(" "), {
        timeout: timeout + 5000, // give docker a little extra
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        encoding: "utf-8",
        env: { ...process.env, ...options.env },
      })

      return {
        output: stdout,
        exitCode: 0,
        durationMs: Date.now() - start,
        timedOut: false,
      }
    } catch (error: any) {
      const stderr = error.stderr ?? ""
      const stdout = error.stdout ?? ""
      const killed = error.killed || (error.signal !== undefined)

      if (killed) {
        timedOut = true
      }

      return {
        output: stdout + stderr || error.message,
        exitCode: error.status ?? 1,
        durationMs: Date.now() - start,
        timedOut,
      }
    }
  }

  private resolveImage(language: string): string {
    const images: Record<string, string> = {
      python: "python:3.12-alpine",
      python3: "python:3.12-alpine",
      node: "node:22-alpine",
      nodejs: "node:22-alpine",
      javascript: "node:22-alpine",
      js: "node:22-alpine",
      bash: this.#image,
      sh: this.#image,
      shell: this.#image,
    }

    return images[language] ?? this.#image
  }

  private buildCommand(language: string, code: string): string[] {
    switch (language) {
      case "python":
      case "python3":
        return ["python3", "-c", code]
      case "node":
      case "nodejs":
      case "javascript":
      case "js":
        return ["node", "-e", code]
      case "bash":
      case "sh":
      case "shell":
        return ["sh", "-c", code]
      default:
        return ["sh", "-c", code]
    }
  }
}
