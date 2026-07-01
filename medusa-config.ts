import { defineConfig } from "@medusajs/utils"

process.env.TZ = process.env.TZ || "Asia/Ho_Chi_Minh"
process.env.KAMI_TIMEZONE = process.env.KAMI_TIMEZONE || process.env.TZ
process.env.KAMI_UTC_OFFSET = process.env.KAMI_UTC_OFFSET || "UTC+7"

module.exports = defineConfig({
  modules: [
    {
      key: "kami",
      resolve: "./src/modules/kami",
    },
  ],
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      jwtSecret: process.env.JWT_SECRET || "kami_dev_jwt_secret_change_me",
      cookieSecret:
        process.env.COOKIE_SECRET || "kami_dev_cookie_secret_change_me",
      storeCors: process.env.STORE_CORS || "http://localhost:8000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:9000",
      authCors: process.env.AUTH_CORS || "http://localhost:9000",
    },
    sessionOptions: {
      name: "connect.sid",
      resave: true,
      rolling: false,
      saveUninitialized: false,
      ttl: 10 * 60 * 60 * 1000, // 10h
    },
    cookieOptions: {
      secure: false,
      sameSite: "lax",
    },
  },
  admin: {
    disable: false,
  },
})
