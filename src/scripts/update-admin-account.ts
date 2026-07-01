/**
 * Cap nhat tai khoan admin -> admin@kami.com / admin
 * Chay: npx medusa exec ./src/scripts/update-admin-account.ts
 */
export default async function ({ container }: { container: any }) {
  const query = container.resolve("remoteQuery")

  const users = await query.graph({
    entity: "user",
    fields: ["id", "email", "first_name", "last_name"],
  })

  const allUsers = (users.data as any[]) || []
  if (!allUsers.length) {
    console.log(JSON.stringify({ ok: false, error: "Khong tim thay user nao" }))
    return
  }

  const userService = container.resolve("user") as any
  const authService = container.resolve("auth") as any

  for (const user of allUsers) {
    try {
      // Update email + name via user service
      await userService.updateUsers({
        id: user.id,
        email: "admin@kami.com",
        first_name: "Admin",
        last_name: "KAMI",
      })

      // Update password via auth service
      if (typeof authService.updateProvider === "function") {
        await authService.updateProvider("emailpass", {
          entity_id: user.id,
          password: "admin",
        })
      } else if (typeof authService.resetPassword === "function") {
        await authService.resetPassword({
          identifier: "admin@kami.com",
          password: "admin",
        })
      } else {
        console.log(JSON.stringify({
          ok: false,
          user_id: user.id,
          error: `authService co cac method: ${Object.keys(authService).filter(k => typeof authService[k] === 'function').join(', ')}`,
        }))
        continue
      }

      console.log(JSON.stringify({
        ok: true,
        user_id: user.id,
        old_email: user.email,
        new_email: "admin@kami.com",
        password: "admin",
      }))
    } catch (e: any) {
      console.log(JSON.stringify({
        ok: false,
        user_id: user.id,
        error: e.message,
        stack: e.stack?.slice(0, 300),
      }))
    }
  }
}
