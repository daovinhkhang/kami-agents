"use client"

import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { AiAssistent } from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"

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
      <div>
        <Heading level="h2">KAMI</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {recordId ?? "Current record"}
        </Text>
      </div>
      <Button size="small" variant="secondary" onClick={openKami}>
        <AiAssistent />
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

