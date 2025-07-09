# Remote MCP Server Authless

This project hosts an MCP (Model Context Protocol) agent on Cloudflare Workers. It exposes endpoints that return podcast summaries from Airtable and tweet history from KV storage. The server responds through SSE (server-sent events) for real-time delivery.

## Techniques and Patterns

- **Serverless Worker Runtime** – The code runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/).
- **Runtime Data Validation** – Object schemas are defined using [Zod](https://github.com/colinhacks/zod).
- **Airtable Integration** – Airtable records are fetched and validated before being returned.
- **CSV Parsing** – Tweet history is stored as a CSV file and parsed on demand.
- **Durable Object / KV Storage** – The worker accesses KV storage and Durable Objects to persist state.
- **SSE Endpoints** – The agent exposes `/sse` and `/sse/message` endpoints for streaming responses via [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events).

## Libraries and Tools

- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) – provides the MCP server implementation.
- [agents](https://www.npmjs.com/package/agents) – helper utilities for defining MCP agents.
- [Airtable](https://www.npmjs.com/package/airtable) – client for accessing Airtable API.
- [wrangler](https://www.npmjs.com/package/wrangler) – used for building and deploying to Cloudflare Workers.
- [vitest](https://vitest.dev/) – included for testing (though no tests are present yet).
- [biome](https://biomejs.dev/) – formatting and linting.

No custom fonts are referenced in the repository.

## Project Layout

```text
.
├── public
│   └── favicon.ico
├── src
│   ├── index.ts
│   └── schema.ts
├── .vscode
│   └── settings.json
├── biome.json
├── package.json
├── package-lock.json
├── processed_awilkinson_data.csv
├── tsconfig.json
└── worker-configuration.d.ts
```

- **public** – contains static assets for the worker.
- **src** – main TypeScript source. `src/index.ts` defines the worker entrypoint and MCP tools.
- **processed_awilkinson_data.csv** – historical tweet data used by the `search_tweets` tool.
- **worker-configuration.d.ts** – Cloudflare environment type definitions.


