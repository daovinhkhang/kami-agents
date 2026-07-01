# KAMI — Knowledgeable Agent for Medusa Intelligence

<p align="center">
  <strong>AI Agent Harness Embedded in Medusa</strong><br>
  A commerce agent that queries, analyzes, drafts, and acts on your store directly inside the Medusa admin dashboard.
</p>

## Overview

KAMI is a DeepSeek-powered AI agent that lives inside your Medusa admin dashboard. It can query products, orders, customers, inventory, fulfillments, payments, shipping, and taxes; build reports and dashboards; and take actions through Medusa admin tools.

This repository is the source-only KAMI app. The runtime, admin UI, API routes, background jobs, and Medusa integrations all live in this repo root.

## Core Capabilities

- Multi-tool reasoning across commerce data
- Streaming chat with resumable sessions
- Structured report artifacts with KPI, table, chart, and action sections
- Approval gates for risky actions
- Scheduled cron runs
- Voice input and realtime voice flows
- Memory, gateways, sandbox, and autonomous review jobs

## Getting Started

Install dependencies and run the Medusa app with the KAMI module enabled:

```bash
yarn install
cp .env.example .env
yarn db:migrate
yarn dev
```

The admin dashboard runs on `http://localhost:9000/app`.

## Development

- `yarn typecheck`
- `yarn test:kami-unit`
- `yarn test:kami-eval`

