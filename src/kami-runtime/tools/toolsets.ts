import { registerCommerceTools } from "./medusa/commerce"
import { registerCollectionTools } from "./medusa/collections"
import { registerCategoryTools } from "./medusa/categories"
import { registerInventoryTools } from "./medusa/inventory"
import { registerRegionTools } from "./medusa/regions"
import { registerSalesChannelTools } from "./medusa/sales-channels"
import { registerStockLocationTools } from "./medusa/stock-locations"
import { registerFulfillmentTools } from "./medusa/fulfillments"
import { registerShippingTools } from "./medusa/shipping"
import { registerPaymentTools } from "./medusa/payments"
import { registerClaimTools } from "./medusa/claims"
import { registerExchangeTools } from "./medusa/exchanges"
import { registerReturnTools } from "./medusa/returns"
import { registerDraftOrderTools } from "./medusa/draft-orders"
import { registerCustomerGroupTools } from "./medusa/customer-groups"
import { registerTaxTools } from "./medusa/taxes"
import { registerUserTools } from "./medusa/users"
import { registerStoreTools } from "./medusa/store"
import { registerReportTools } from "./medusa/reports"
import { registerRenderArtifactTool } from "./medusa/render-artifact"
import { registerSuggestActionTool } from "./medusa/suggest-action"
import { registerCallApiTools } from "./medusa/call-api"
import { registerGeneralTools } from "./general"
import { registerFileTools } from "./general/file-tools"
import { registerWebTools } from "./general/web-tools"
import { registerTerminalTools } from "./general/terminal-tool"
import { initGateways } from "../gateways"

let registered = false

export const ensureToolsRegistered = () => {
  if (registered) {
    return
  }

  registerGeneralTools()
  registerFileTools()
  registerWebTools()
  registerTerminalTools()
  registerCommerceTools()
  registerCollectionTools()
  registerCategoryTools()
  registerInventoryTools()
  registerRegionTools()
  registerSalesChannelTools()
  registerStockLocationTools()
  registerFulfillmentTools()
  registerShippingTools()
  registerPaymentTools()
  registerClaimTools()
  registerExchangeTools()
  registerReturnTools()
  registerDraftOrderTools()
  registerCustomerGroupTools()
  registerTaxTools()
  registerUserTools()
  registerStoreTools()
  registerReportTools()
  registerRenderArtifactTool()
  registerSuggestActionTool()
  registerCallApiTools()
  initGateways()
  registered = true
}
