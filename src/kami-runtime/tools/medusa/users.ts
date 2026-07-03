import { objectSchema, pagination, graph, graphById, stringArg, typedPayload, isObj, isNonEmptyStr, isValidEmail, missingField } from "./shared"
import { registerTool } from "../registry"
import type { ArgValidationResult } from "../registry"
import type { KamiCtx } from "../../types"

const API_KEY_TYPES = ["publishable", "secret"]

const validateCreateUser = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const user = args.user
  if (!isObj(user)) {
    return missingField(
      "create_user",
      ["user"],
      "create_user requires a `user` object.",
      "Provide a user object with email and first_name."
    )
  }
  const fields: string[] = []
  if (!isValidEmail(user.email)) fields.push("user.email")
  if (!isNonEmptyStr(user.first_name)) fields.push("user.first_name")
  if (!fields.length) return null
  return missingField(
    "create_user",
    fields,
    "create_user requires a valid email and a non-empty first_name.",
    "Set user.email (a valid address) and user.first_name."
  )
}

const validateCreateInvite = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const invite = args.invite
  if (!isObj(invite) || !isValidEmail(invite.email)) {
    return missingField(
      "create_invite",
      ["invite.email"],
      "create_invite requires an invite object with a valid email.",
      "Provide invite.email (a valid address)."
    )
  }
  return null
}

const validateCreateRole = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const role = args.role
  if (!isObj(role) || !isNonEmptyStr(role.name)) {
    return missingField(
      "create_role",
      ["role.name"],
      "create_role requires a role object with a non-empty name.",
      "Provide role.name (e.g. 'Store Manager')."
    )
  }
  return null
}

const validateCreateApiKey = (
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const apiKey = args.api_key
  if (!isObj(apiKey)) {
    return missingField(
      "create_api_key",
      ["api_key"],
      "create_api_key requires an `api_key` object.",
      "Provide an api_key object with title and type."
    )
  }
  const fields: string[] = []
  if (!isNonEmptyStr(apiKey.title)) fields.push("api_key.title")
  if (!isNonEmptyStr(apiKey.type) || !API_KEY_TYPES.includes(apiKey.type as string))
    fields.push("api_key.type")
  if (!fields.length) return null
  return missingField(
    "create_api_key",
    fields,
    `create_api_key requires a title and a type of ${API_KEY_TYPES.join(" or ")}.`,
    "Set api_key.title and api_key.type ('publishable' for storefronts, 'secret' for server-side)."
  )
}

const validateRoleIds = (
  tool: string,
  args: Record<string, unknown>
): ArgValidationResult | null => {
  const roleIds = args.role_ids
  if (!Array.isArray(roleIds) || roleIds.length === 0 || !roleIds.every((r) => isNonEmptyStr(r))) {
    return missingField(
      tool,
      ["role_ids"],
      `${tool} requires a non-empty role_ids array of role IDs.`,
      "Provide role_ids as a list of role IDs. List roles first with list_roles if you do not know them."
    )
  }
  return null
}

export const registerUserTools = () => {
  registerTool({
    name: "list_users",
    toolset: "admin",
    description: "List admin users.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "user", args),
  })

  registerTool({
    name: "get_user",
    toolset: "admin",
    description: "Get an admin user by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "user", args.id),
  })

  registerTool({
    name: "create_user",
    toolset: "admin",
    description: "Create an admin user. Requires email and first_name at minimum.",
    risk: "mutating",
    schema: objectSchema(
      { user: { type: "object" } },
      ["user"]
    ),
    validate: validateCreateUser,
    handler: async (args, ctx: KamiCtx) => {
      const { createUsersWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createUsersWorkflow, {
        users: [typedPayload(args, "user")],
      })
    },
  })

  registerTool({
    name: "update_user",
    toolset: "admin",
    description: "Update an admin user by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateUsersWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateUsersWorkflow, {
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_user",
    toolset: "admin",
    description: "Delete an admin user by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteUsersWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteUsersWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "user", deleted: true }
    },
  })

  // --- Invites ---

  registerTool({
    name: "list_invites",
    toolset: "admin",
    description: "List admin invites.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "invite", args),
  })

  registerTool({
    name: "create_invite",
    toolset: "admin",
    description: "Create an admin invite for a new user.",
    risk: "mutating",
    schema: objectSchema(
      { invite: { type: "object" } },
      ["invite"]
    ),
    validate: validateCreateInvite,
    handler: async (args, ctx: KamiCtx) => {
      const { createInvitesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createInvitesWorkflow, {
        invites: [typedPayload(args, "invite")],
      })
    },
  })

  registerTool({
    name: "delete_invite",
    toolset: "admin",
    description: "Delete an admin invite by ID.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteInvitesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteInvitesWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "invite", deleted: true }
    },
  })

  // --- RBAC Roles ---

  registerTool({
    name: "list_roles",
    toolset: "admin",
    description: "List RBAC roles.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "rbac_role", args),
  })

  registerTool({
    name: "get_role",
    toolset: "admin",
    description: "Get an RBAC role by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "rbac_role", args.id),
  })

  registerTool({
    name: "create_role",
    toolset: "admin",
    description:
      "Create an RBAC role. Requires a name. Optionally attach policy_ids and parent_ids.",
    risk: "mutating",
    schema: objectSchema(
      { role: { type: "object" } },
      ["role"]
    ),
    validate: validateCreateRole,
    handler: async (args, ctx: KamiCtx) => {
      const { createRbacRolesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(createRbacRolesWorkflow, {
        actor_id: ctx.userId ?? "kami",
        actor: "user",
        roles: [typedPayload(args, "role")],
      })
    },
  })

  registerTool({
    name: "update_role",
    toolset: "admin",
    description: "Update an RBAC role by ID.",
    risk: "mutating",
    schema: objectSchema(
      { id: { type: "string" }, update: { type: "object" } },
      ["id", "update"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { updateRbacRolesWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(updateRbacRolesWorkflow, {
        actor_id: ctx.userId ?? "kami",
        actor: "user",
        selector: { id: stringArg(args, "id") },
        update: typedPayload(args, "update"),
      })
    },
  })

  registerTool({
    name: "delete_role",
    toolset: "admin",
    description: "Delete an RBAC role by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteRbacRolesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteRbacRolesWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "rbac_role", deleted: true }
    },
  })

  registerTool({
    name: "assign_user_roles",
    toolset: "admin",
    description: "Assign one or more RBAC roles to an admin user.",
    risk: "mutating",
    schema: objectSchema(
      {
        user_id: { type: "string" },
        role_ids: { type: "array", items: { type: "string" } },
      },
      ["user_id", "role_ids"]
    ),
    validate: (args) => validateRoleIds("assign_user_roles", args),
    handler: async (args, ctx: KamiCtx) => {
      const { assignUserRolesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(assignUserRolesWorkflow, {
        actor_id: ctx.userId ?? "kami",
        actor: "user",
        user_id: stringArg(args, "user_id"),
        role_ids: args.role_ids as string[],
      })
      return { user_id: args.user_id, role_ids: args.role_ids, object: "user_role", assigned: true }
    },
  })

  registerTool({
    name: "remove_user_roles",
    toolset: "admin",
    description: "Remove one or more RBAC roles from an admin user.",
    risk: "mutating",
    schema: objectSchema(
      {
        user_id: { type: "string" },
        role_ids: { type: "array", items: { type: "string" } },
      },
      ["user_id", "role_ids"]
    ),
    validate: (args) => validateRoleIds("remove_user_roles", args),
    handler: async (args, ctx: KamiCtx) => {
      const { removeUserRolesWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(removeUserRolesWorkflow, {
        actor_id: ctx.userId ?? "kami",
        actor: "user",
        user_id: stringArg(args, "user_id"),
        role_ids: args.role_ids as string[],
      })
      return { user_id: args.user_id, role_ids: args.role_ids, object: "user_role", removed: true }
    },
  })

  // --- API Keys ---

  registerTool({
    name: "list_api_keys",
    toolset: "admin",
    description: "List API keys.",
    risk: "read",
    schema: objectSchema({
      ...pagination,
      filters: { type: "object" },
    }),
    handler: (args, ctx) => graph(ctx, "api_key", args),
  })

  registerTool({
    name: "get_api_key",
    toolset: "admin",
    description: "Get an API key by ID.",
    risk: "read",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: (args, ctx) => graphById(ctx, "api_key", args.id),
  })

  registerTool({
    name: "create_api_key",
    toolset: "admin",
    description:
      "Create an API key. Requires title and type ('publishable' for storefronts, 'secret' for server-side auth).",
    risk: "mutating",
    schema: objectSchema(
      { api_key: { type: "object" } },
      ["api_key"]
    ),
    validate: validateCreateApiKey,
    handler: async (args, ctx: KamiCtx) => {
      const { createApiKeysWorkflow } = await import("@medusajs/core-flows")
      const apiKey = typedPayload<Record<string, unknown>>(args, "api_key")
      return await ctx.executor.runWorkflow(createApiKeysWorkflow, {
        api_keys: [{ created_by: ctx.userId ?? "kami", ...apiKey }],
      })
    },
  })

  registerTool({
    name: "revoke_api_key",
    toolset: "admin",
    description:
      "Revoke an API key by ID. A revoked key can no longer authenticate. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema(
      { id: { type: "string" }, revoke_in: { type: "number" } },
      ["id"]
    ),
    handler: async (args, ctx: KamiCtx) => {
      const { revokeApiKeysWorkflow } = await import("@medusajs/core-flows")
      return await ctx.executor.runWorkflow(revokeApiKeysWorkflow, {
        selector: { id: stringArg(args, "id") },
        revoke: {
          revoked_by: ctx.userId ?? "kami",
          ...(args.revoke_in != null ? { revoke_in: Number(args.revoke_in) } : {}),
        },
      })
    },
  })

  registerTool({
    name: "delete_api_key",
    toolset: "admin",
    description: "Delete an API key by ID. Destructive and approval-gated.",
    risk: "destructive",
    schema: objectSchema({ id: { type: "string" } }, ["id"]),
    handler: async (args, ctx: KamiCtx) => {
      const { deleteApiKeysWorkflow } = await import("@medusajs/core-flows")
      await ctx.executor.runWorkflow(deleteApiKeysWorkflow, { ids: [stringArg(args, "id")] })
      return { id: args.id, object: "api_key", deleted: true }
    },
  })
}
