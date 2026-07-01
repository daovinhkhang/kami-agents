import type { GatewayAdapter, GatewayConnection } from "./types"

const adapters = new Map<string, GatewayAdapter>()

export const registerGateway = (adapter: GatewayAdapter) => {
  adapters.set(adapter.id, adapter)
}

export const getGateway = (id: string) => adapters.get(id)

export const listGateways = (): GatewayConnection[] => {
  return [...adapters.values()].map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    enabled: true,
    config: {},
  }))
}

export const hasGateway = (id: string) => adapters.has(id)
