# Payload MCP Setup (Local-Only, Codex CLI on WSL)

This project uses the official Payload MCP plugin (`@payloadcms/plugin-mcp`).

## 1. Enable MCP locally

In `backend/.env.local`, set:

```bash
PAYLOAD_ENABLE_MCP=true
```

Keep this in `.env.local` only. Do not commit real secrets or local environment values.

## 2. Start the backend

From `backend/`:

```bash
pnpm dev
```

With default plugin settings, MCP is exposed at:

```text
http://localhost:3000/api/mcp
```

## 3. Register Payload MCP in Codex CLI (inside WSL)

```bash
codex mcp add payload --url http://localhost:3000/api/mcp
codex mcp list --json
```

## 4. What "local-only" means

- Commit the plugin code and config changes.
- Do not commit local env files (`.env.local` is gitignored).
- "Local-only" is about network exposure: only your machine/WSL can access loopback addresses like `localhost`.

## 5. Optional safety hardening

- Keep `PAYLOAD_ENABLE_MCP=false` in environments where MCP should be disabled.
- If you later expose MCP remotely, add auth/network controls before public access.
