# C4 Voice Control - Deployment Status

This file summarizes the **current reference deployment** of the C4 voice stack on a Synology NAS using **Container Manager (Docker Compose)**.

## Current Services (LAN)

- **Backend (c4-mcp-app backend)**: `http://<NAS_IP>:3002`
   - Health: `GET http://<NAS_IP>:3002/api/v1/health`
   - MCP health: `GET http://<NAS_IP>:3002/api/v1/health/mcp`
   - WebSocket: `ws://<NAS_IP>:3002/ws?token=<jwt>`
- **Control4 MCP server (c4-mcp)**: `http://<NAS_IP>:3334`
   - Tools: `GET http://<NAS_IP>:3334/mcp/list`
   - Calls: `POST http://<NAS_IP>:3334/mcp/call`

Frontend note:
- For best microphone permission behavior, the frontend is often run **locally** (same device as the browser) and pointed at the backend LAN URL.

## What “Done” Looks Like

- `c4-mcp` returns real tool results (e.g. rooms/lights) and can perform writes when enabled.
- Backend can authenticate and connect to `c4-mcp`.
- Ambiguous commands (e.g. “Basement lights”) trigger an interactive clarification round-trip:
   - Server → UI: `clarification-required`
   - UI → Server: `clarification-choice`
   - Server retries deterministically.

## Quick Tests

```bash
# Backend health
curl http://<NAS_IP>:3002/api/v1/health

# Backend -> c4-mcp connectivity
curl http://<NAS_IP>:3002/api/v1/health/mcp

# c4-mcp tools
curl http://<NAS_IP>:3334/mcp/list
```

## Config Pointers

- Backend env vars: see [API_KEYS.md](API_KEYS.md)
   - `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`
   - `C4_MCP_BASE_URL=http://<NAS_IP>:3334`
- c4-mcp safety:
   - `C4_WRITES_ENABLED=true`
   - keep guardrails enabled (`C4_WRITE_GUARDRAILS=true`) unless intentionally changing safety posture

## Legacy Docs

If you see references to **Task Scheduler**, **Web Station**, or **port 3001**, they describe an earlier non-container deployment approach.

## Documentation

- [Project Overview](docs/project_overview.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api/endpoints.md)
- [Operations Runbook](docs/ops/runbook.md)
