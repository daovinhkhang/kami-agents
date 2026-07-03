"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import kamiIcon from "../routes/kami/kami-icon.png"

const KAMI_ICON_SRC = kamiIcon

const AskKamiWidget = (props: any) => {
  const recordId = props?.data?.id ?? props?.id

  const openKami = () => {
    const query = recordId
      ? `?context=${encodeURIComponent(String(recordId))}`
      : ""

    window.location.assign(`/app/kami${query}`)
  }

  return (
    <Container className="flex items-center justify-between gap-x-3 p-4">
      <div className="flex min-w-0 items-center gap-x-3">
        <img
          src={KAMI_ICON_SRC}
          alt="KAMI"
          className="size-9 shrink-0 rounded-full object-cover"
          loading="eager"
        />
        <div className="min-w-0">
          <Heading level="h2">KAMI</Heading>
          <Text size="small" className="truncate text-ui-fg-subtle">
            {recordId ?? "Current record"}
          </Text>
        </div>
      </div>
      <Button size="small" variant="secondary" onClick={openKami}>
        Ask
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: [
    "order.details.side.after",
    "product.details.side.after",
    "customer.details.side.after",
  ],
})

export default AskKamiWidget
