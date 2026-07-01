import type { KamiAutonomyMode, KamiConfig, KamiToolRisk } from "../types"

type AutonomyTool = {
  name: string
  risk: KamiToolRisk
}

export type AutonomyDecision = {
  mode: KamiAutonomyMode
  tool: string
  risk: KamiToolRisk
  allowed: boolean
  approval_required: boolean
  reason: string
}

export const describeAutonomyMode = (mode: KamiAutonomyMode) => {
  if (mode === "assist") {
    return "Read-only and safe tools run directly. Mutating and destructive tools require approval."
  }

  if (mode === "autopilot") {
    return "Read, safe, and mutating tools run directly. Destructive tools require approval unless explicitly allowed."
  }

  return "Read, safe, and mutating tools run directly. Destructive tools require approval."
}

export const evaluateAutonomy = (
  tool: AutonomyTool,
  config: KamiConfig,
  options: {
    skipApproval?: boolean
    forcedDestructiveApproval?: boolean
  } = {}
): AutonomyDecision => {
  if (options.skipApproval) {
    return {
      mode: config.autonomyMode,
      tool: tool.name,
      risk: tool.risk,
      allowed: true,
      approval_required: false,
      reason: "Approval was already granted for this tool call.",
    }
  }

  if (tool.risk === "read" || tool.risk === "safe") {
    return {
      mode: config.autonomyMode,
      tool: tool.name,
      risk: tool.risk,
      allowed: true,
      approval_required: false,
      reason: "Read-only and safe tools are allowed in every autonomy mode.",
    }
  }

  if (config.autonomyMode === "assist" && tool.risk === "mutating") {
    return {
      mode: config.autonomyMode,
      tool: tool.name,
      risk: tool.risk,
      allowed: true,
      approval_required: true,
      reason: "Assist mode requires approval before mutating commerce data.",
    }
  }

  if (tool.risk === "mutating") {
    return {
      mode: config.autonomyMode,
      tool: tool.name,
      risk: tool.risk,
      allowed: true,
      approval_required: false,
      reason: "Mutating tools are allowed directly in copilot and autopilot modes.",
    }
  }

  if (
    config.autonomyMode === "autopilot" &&
    config.autonomyAllowDestructive &&
    !options.forcedDestructiveApproval
  ) {
    return {
      mode: config.autonomyMode,
      tool: tool.name,
      risk: tool.risk,
      allowed: true,
      approval_required: false,
      reason: "Autopilot destructive execution is explicitly enabled.",
    }
  }

  return {
    mode: config.autonomyMode,
    tool: tool.name,
    risk: tool.risk,
    allowed: true,
    approval_required: true,
    reason: "Destructive commerce tools require approval by policy.",
  }
}

export const buildAutonomySnapshot = (config: KamiConfig) => ({
  mode: config.autonomyMode,
  description: describeAutonomyMode(config.autonomyMode),
  max_mutations_per_turn: config.autonomyMaxMutationsPerTurn,
  allow_destructive_without_approval: config.autonomyAllowDestructive,
  approval_required: config.approvalRequired,
  eval_harness_enabled: config.evalHarnessEnabled,
  policies: [
    {
      risk: "read",
      direct: true,
      approval_required: false,
    },
    {
      risk: "safe",
      direct: true,
      approval_required: false,
    },
    {
      risk: "mutating",
      direct: config.autonomyMode !== "assist",
      approval_required: config.autonomyMode === "assist",
    },
    {
      risk: "destructive",
      direct: config.autonomyMode === "autopilot" && config.autonomyAllowDestructive && !config.approvalRequired,
      approval_required: !(config.autonomyMode === "autopilot" && config.autonomyAllowDestructive && !config.approvalRequired),
    },
  ],
})
