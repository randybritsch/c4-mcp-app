# PROJECT BOOTSTRAP SUMMARY — c4-mcp-app

**Last Updated:** January 26, 2026

**1) One-line purpose**
Provide a lightweight **voice + text** interface for Control4: a PWA frontend talks to a Node.js backend that converts natural language into deterministic `c4-mcp` tool calls and streams progress/results over WebSocket.

**2) Architecture overview (3–6 bullets)**
- **Frontend (PWA)**: static files in `frontend/` capture mic audio (MediaRecorder or WAV fallback) and render streamed status.
- **Backend (Node/Express)**: REST API + WebSocket server (container port 3000; NAS commonly exposes host `:3002`).
- **Cloud AI**: STT (Google/Azure) → transcript; LLM (OpenAI by default) → structured `{ tool, args }` plan.
- **Control4 bridge**: backend calls a separate `c4-mcp` HTTP server via `C4_MCP_BASE_URL` (no shared code between repos).
- **Clarification UX**: ambiguous tool results become `clarification-required`; UI replies with `clarification-choice`; backend rebuilds args (preferring stable IDs like `room_id` when available) and retries.
- **Production routing**: Synology reverse proxy terminates HTTPS/WSS; `/api/*` and `/ws` must support WebSocket upgrade.

**3) Key modules and roles (bullet list)**
- `backend/src/server.js`: HTTP + WebSocket server entry.
- `backend/src/app.js`: Express wiring (middleware, routes, error handling).
- `backend/src/routes/voice.js`: `/api/v1/voice/process` + `/process-text` pipeline.
- `backend/src/websocket.js`: WS protocol for streaming stages, transcription, intent, execution, clarification.
- `backend/src/services/stt.js`: STT providers; supports WAV/PCM inputs for mobile Safari fallback.
- `backend/src/services/llm.js`: intent parsing to a deterministic plan.
- `backend/src/services/mcp-client.js`: calls `c4-mcp` (`/mcp/list`, `/mcp/call`), enforces timeouts, passes session headers, maps ambiguity.
- `frontend/js/voice.js`: voice capture (MediaRecorder + WAV fallback).
- `frontend/js/websocket.js`: WS client + reconnection and state transitions.

**4) Data & contracts (top 3–5 only)**
- Auth: `POST /api/v1/auth/token` → JWT; client uses `Authorization: Bearer <token>` and `wss://.../ws?token=...`.
- Text command: `POST /api/v1/voice/process-text` body `{ transcript: string }` (optionally supports a test `plan` override).
- Voice command: `POST /api/v1/voice/process` body `{ audioData: base64, format, sampleRateHertz? }`.
- Plan contract: `{ tool: string, args: object }` (LLM output).
- Clarification contract: `clarification-required` (candidates) → `clarification-choice` (index) → retry.

**5) APIs (key endpoints only)**
- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process`
- `POST /api/v1/voice/process-text`
- WebSocket: `/ws?token=...`

**6) Coding conventions (only the rules the AI must always follow)**
- Config is env-driven via `backend/src/config/index.js`; never hardcode NAS IPs/ports in code.
- Preserve the backend↔MCP contract (`/mcp/list`, `/mcp/call` payload shape; ambiguity/clarification mapping).
- Always pass a stable session id to `c4-mcp` via `X-Session-Id` (use deviceId); don’t re-implement “memory” here.
- Use consistent structured errors (code + HTTP status) and include correlation IDs in logs.
- Keep secrets out of logs and out of git; `.env` should remain local-only.

**7) Current priorities (Top 5)**
1. Keep end-to-end reliability on NAS (HTTPS + WSS reverse proxy; avoid mixed-content).
2. Ensure mobile voice capture works broadly (MediaRecorder + WAV fallback).
3. Keep clarification flows correct (room vs device vs source) and avoid “stuck executing” (retry must be schema-valid).
4. Maintain timeouts on MCP calls to prevent indefinite hangs.
5. Keep deploys repeatable (compose, health checks, and clear env templates).

**8) Open risks/unknowns (Top 5)**
1. External API cost/quotas and transient failures (STT/LLM).
2. Browser codec and permission variability (especially iOS/Safari).
3. WebSocket stability on mobile networks and under reverse proxies.
4. Ambiguity frequency (common room/device naming) and edge-case retries.
5. Safety risk if services are exposed beyond LAN (prefer firewall/VPN; never public by default).

**9) Links/paths to full docs**
- `docs/project_overview.md`
- `docs/architecture.md`
- `docs/api/endpoints.md`
- `docs/ops/runbook.md`
- `docs/conventions_guardrails.md`
- `compose.nas.yaml`
- `README.md`
