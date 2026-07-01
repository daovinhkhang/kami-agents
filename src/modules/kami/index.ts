import { Module } from "@medusajs/framework/utils"
import { KamiModuleService } from "@services"

export const KAMI_MODULE = "kami"

export default Module(KAMI_MODULE, {
  service: KamiModuleService,
})
