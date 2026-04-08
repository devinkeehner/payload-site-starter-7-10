# Payload MCP Setup

This backend exposes the official Payload MCP route at `https://admin.cthousegop.com/api/mcp` when `PAYLOAD_ENABLE_MCP=true`.

## Standard setup

- Enable MCP in the live backend with `PAYLOAD_ENABLE_MCP=true`
- Use the official `/api/mcp` endpoint for routine Codex and backend work
- Authenticate with a bearer token from the `payload-mcp-api-keys` collection

Example client config:

```bash
codex mcp add payload --url https://admin.cthousegop.com/api/mcp --bearer-token-env-var PAYLOAD_MCP_API_KEY
```

`PAYLOAD_MCP_API_KEY` is just the local/client env name that holds the bearer token value.

## Optional compatibility routes

- `http://localhost:3000/api/mcp-chatgpt` is the custom local bridge for the curated tool surface
- `https://admin.cthousegop.com/api/mcp-public/<secret>` is the secret-path proxy for connector testing

## Notes

- Prefer the live `/api/mcp` endpoint whenever possible
- Keep MCP secrets in environment variables only
- The proxy route is for compatibility, not the primary backend path
