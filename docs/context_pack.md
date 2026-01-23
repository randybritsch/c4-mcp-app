# Context Pack — C4 Voice Control

## Executive Summary

This system provides voice + text control of a Control4 home via a browser UI.

- **Backend (c4-mcp-app)**: Node.js v22 Express + WebSocket on `http://<NAS_IP>:3002`.
- **Control4 integration**: via `c4-mcp` HTTP server on `http://<NAS_IP>:3334`.
- **Cloud AI**: STT (Google/Azure) + OpenAI intent parsing (tested with `gpt-4o-mini`).
- **Deployment**: Synology Container Manager (Compose project).

Status: ✅ deployed and working end-to-end, including writes (when enabled in `c4-mcp`) and interactive disambiguation.

---

## Critical Architecture (6 bullets)

1. **Voice pipeline:** Browser mic → WebSocket streaming audio → backend STT → backend LLM intent → backend calls `c4-mcp` tools → stream progress/results back to UI.
2. **Text pipeline:** UI text → backend `/api/v1/voice/process-text` → LLM intent → `c4-mcp` tools.
3. **Write safety:** `c4-mcp` blocks write tools unless `C4_WRITES_ENABLED=true` (guardrails can remain on).
4. **Ambiguity handling (Option C):** if `c4-mcp` responds “ambiguous”, backend emits `clarification-required` with candidates, UI prompts, UI replies `clarification-choice`, backend retries with stricter args (`require_unique`, selected room/device).
5. **Ports (LAN):** backend `3002`, `c4-mcp` `3334`.
6. **Key endpoints:** REST health + auth + process endpoints; WebSocket at `/ws`.

---

## Interfaces/Contracts — do not break

### REST (Backend)

- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process`
- `POST /api/v1/voice/process-text`

### WebSocket (UI ↔ Backend)

- Connect: `ws://<NAS_IP>:3002/ws?token=<jwt>`
- Client → server message types: `audio-start`, `audio-chunk`, `audio-end`, `clarification-choice`, `ping`
- Server → client message types: `processing`, `transcript`, `intent`, `clarification-required`, `command-complete`, `error`, `pong`

### MCP (Backend ↔ c4-mcp)

- List tools: `GET http://<NAS_IP>:3334/mcp/list`
- Call tool: `POST http://<NAS_IP>:3334/mcp/call` with payload `{"kind":"tool","name":"<tool>","args":{...}}`

---

## Current Working Set (where to look)

- Backend WebSocket orchestration: `backend/src/websocket.js`
- `c4-mcp` integration + ambiguity extraction: `backend/src/services/mcp-client.js`
- Backend routes: `backend/src/routes/health.js`, `backend/src/routes/auth.js`, `backend/src/routes/voice.js`
- Frontend UI + clarification picker: `frontend/js/app.js`

---

## Quick Status Check

```bash
curl http://<NAS_IP>:3002/api/v1/health
curl http://<NAS_IP>:3002/api/v1/health/mcp
curl http://<NAS_IP>:3334/mcp/list
```

---

## Next Prompt to Paste

```text
You are joining the C4 Voice Control project. Use this Context Pack.

Current deployment (LAN):
- Backend: http://<NAS_IP>:3002
- WebSocket: ws://<NAS_IP>:3002/ws?token=...
- c4-mcp: http://<NAS_IP>:3334
- LLM: OpenAI (tested with gpt-4o-mini)

Important behavior:
- Writes are blocked in c4-mcp unless C4_WRITES_ENABLED=true (guardrails can remain on).
- If a command is ambiguous, backend emits clarification-required with candidates, UI sends clarification-choice, backend retries with require_unique and scoped args.

Your tasks:
1) Validate health endpoints and c4-mcp connectivity.
2) Validate voice + text flows.
3) Confirm disambiguation loop works end-to-end.
Proceed step-by-step and keep changes minimal.
```