import { objectSchema, pagination, graph, graphById, stringArg, typedPayload } from "./shared"
import { registerTool } from "../registry"
import type { KamiCtx } from "../../types"

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
}
