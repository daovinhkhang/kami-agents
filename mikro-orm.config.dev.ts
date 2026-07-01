// MikroORM CLI config for generating/running module-level migrations
// Usage (from kami-app):
//   MIKRO_ORM_CLI_CONFIG=./mikro-orm.config.dev.ts \
//     MIKRO_ORM_ALLOW_GLOBAL_CLI=true npx medusa-mikro-orm migration:create --initial
import { defineMikroOrmCliConfig } from "@medusajs/framework/utils"
import * as entities from "./src/modules/kami/models"

export default defineMikroOrmCliConfig("kami", {
  entities: Object.values(entities),
})
