import { createWorkflow } from "@medusajs/framework/workflows-sdk"

const STORE_NAME = process.env.STORE_NAME || "Medusa Store"

export default async function ({ container }) {
  const query = container.resolve("remoteQuery")

  // Get current store
  const stores = await query.graph({
    entity: "store",
    fields: ["id", "name", "default_sales_channel_id", "default_region_id"],
  })

  const store = (stores.data as any[])?.[0]
  if (!store) {
    console.log(JSON.stringify({ ok: false, error: "No store found" }))
    return
  }

  if (store.name === STORE_NAME) {
    console.log(
      JSON.stringify({ ok: true, action: "skip", reason: "already set" })
    )
    return
  }

  // Use updateStoresWorkflow to update store name
  const { updateStoresWorkflow } = await import("@medusajs/core-flows")

  const { result } = await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { name: STORE_NAME },
    },
  })

  console.log(
    JSON.stringify({
      ok: true,
      action: "updated",
      store_id: store.id,
      old_name: store.name,
      new_name: STORE_NAME,
    })
  )
}
