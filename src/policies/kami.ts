import { definePolicies } from "@medusajs/framework/utils"

export const kamiPolicies = definePolicies([
  {
    name: "KAMI Read",
    resource: "kami",
    operation: "read",
    description: "Read KAMI sessions, skills, memory, audit, settings, and cron.",
  },
  {
    name: "KAMI Chat",
    resource: "kami",
    operation: "chat",
    description: "Run KAMI chat turns and read stream events.",
  },
  {
    name: "KAMI Manage",
    resource: "kami",
    operation: "manage",
    description: "Manage KAMI skills, memory, approvals, cron, and halt state.",
  },
  {
    name: "KAMI All",
    resource: "kami",
    operation: "*",
    description: "Full KAMI access.",
  },
])

