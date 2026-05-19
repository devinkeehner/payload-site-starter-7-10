# Payload MCP Setup

This backend exposes the official Payload MCP route at `https://admin.cthousegop.com/api/mcp` when `PAYLOAD_ENABLE_MCP=true`.

## Standard setup

- Enable MCP in the live backend with `PAYLOAD_ENABLE_MCP=true`
- Use the official `/api/mcp` endpoint for routine Codex and backend work
- Authenticate with a bearer token from the `payload-mcp-api-keys` collection

Example client config:

```bash
codex mcp add payload --url https://admin.cthousegop.com/api/mcp --bearer-token-env-var PAYLOAD_MCP_TOKEN
```

`PAYLOAD_MCP_TOKEN` is the local/client env name that holds the bearer token value.
If you still have older setup scripts, `PAYLOAD_MCP_API_KEY` is accepted by the backend proxy routes as a fallback.

## Optional compatibility routes

- `https://admin.cthousegop.com/api/chatgpt-mcp` is the OAuth-backed ChatGPT connector route. Set `CHATGPT_PAYLOAD_MCP_API_KEY` to a valid Payload MCP API key so it can proxy to `/api/mcp`.
- `https://admin.cthousegop.com/api/mcp-public/<secret>` is the secret-path proxy for connector testing

## Notes

- Prefer the live `/api/mcp` endpoint whenever possible
- Keep MCP secrets in environment variables only
- The proxy route is for compatibility, not the primary backend path
