# Payload MCP Setup

This backend exposes three MCP routes:

- Official Payload MCP route: `https://admin.cthousegop.com/api/mcp`
- Curated ChatGPT route: `http://localhost:3000/api/mcp-chatgpt`
- Secret-path proxy route: `https://admin.cthousegop.com/api/mcp-public/<secret>`

They do not all authenticate the same way.

## 1. Enable MCP locally

In `backend/.env.local`, set:

```bash
PAYLOAD_ENABLE_MCP=true
```

Keep local env values out of git.

## 2. Start the backend

From `backend/`:

```bash
pnpm dev
```

Use the real backend port if you intentionally run somewhere other than `3000`.

## 3. Pick the right route

### Option A: Official Payload MCP

Use this when you want the full official plugin surface.

Important: `/api/mcp` does not use the custom `PAYLOAD_MCP_API_KEY` env var by default. It expects a bearer token that matches a record in the `payload-mcp-api-keys` collection.

That means all of the following must be true:

- Codex must send `Authorization: Bearer <token>`
- `<token>` must be an actual key created in `payload-mcp-api-keys`
- that key must allow the collections/tools you need

Example Codex registration:

```bash
export PAYLOAD_MCP_TOKEN='your-official-payload-mcp-api-key'
codex mcp add payload --url https://admin.cthousegop.com/api/mcp --bearer-token-env-var PAYLOAD_MCP_TOKEN
```

If Codex hits `/api/mcp` without a valid bearer token, startup will fail with a `401` and the client may report an initialize or response-decoding error.

### Option B: Curated Local Route

Use this when you want the repo's custom route that authenticates against `PAYLOAD_MCP_API_KEY`.

```bash
export PAYLOAD_MCP_TOKEN="$(grep '^PAYLOAD_MCP_API_KEY=' .env.local | cut -d= -f2-)"
codex mcp add payload --url http://localhost:3000/api/mcp-chatgpt --bearer-token-env-var PAYLOAD_MCP_TOKEN
```

This route exposes a narrower tool set than the official plugin route, but it is usually the easiest local path if you already manage `PAYLOAD_MCP_API_KEY` in `.env.local`.

### Option C: Secret-Path Proxy

Use this only when a remote client needs HTTPS access and you have configured a public secret:

```bash
PAYLOAD_MCP_PUBLIC_SECRET=...
```

By default the proxy forwards to `/api/mcp` and injects `PAYLOAD_MCP_API_KEY` upstream.

Use this route primarily for ChatGPT consumer connector testing. For routine Codex and backend work, use the direct live endpoint above.

## 4. Local troubleshooting

- `POST /api/mcp 401`: the route is up, but the bearer token is missing or invalid
- initialize or decode error in the client: often the client expected MCP JSON/SSE but received the `401` JSON error body instead
- slow first hit in `next dev`: often a cold route compile, not a broken server
- `404` on `/api/mcp-public/<secret>`: missing or wrong `PAYLOAD_MCP_PUBLIC_SECRET`, or MCP is disabled

Warm the route before judging it:

1. Confirm the backend is actually listening on the expected port
2. Call `tools/list`
3. Call one real read-only tool

## 5. What "local-only" means

- Commit code and config changes, not local secrets
- Keep `.env.local` out of git
- Loopback routes like `localhost` are only reachable from your local machine or WSL environment
