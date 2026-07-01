import { authenticate, defineMiddlewares } from "@medusajs/framework/http"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/kami/asr/transcribe",
      methods: ["POST"],
      bodyParser: {
        sizeLimit: "25mb",
      },
    },
    {
      matcher: "/admin/kami*",
      middlewares: [authenticate("user", ["session", "bearer", "api-key"])],
    },
  ],
})
