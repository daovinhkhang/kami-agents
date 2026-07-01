import { defineJoinerConfig } from "@medusajs/framework/utils"

// Declares how other modules can link to KAMI entities (used in Phase 1
// when linking sessions to orders/customers via defineLink).
export const joinerConfig = defineJoinerConfig("kami", {
  linkableKeys: {
    kami_session_id: "KamiSession",
    kami_message_id: "KamiMessage",
  },
})
