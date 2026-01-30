# PROJECT BOOTSTRAP SUMMARY — c4-mcp-app

**Last Updated:** January 29, 2026

**1) One-line purpose**
Provide a lightweight **voice + text** UI for Control4: a PWA frontend talks to a Node.js backend that turns natural language into deterministic `c4-mcp` tool calls, streaming progress/results over WebSocket.

**2) Architecture overview (3–6 bullets)**
- **Frontend (PWA)**: static app in `frontend/` (hosted behind Synology nginx/Web Station for HTTPS) captures mic audio and renders streamed state.
- **Backend (Node/Express)**: REST + WebSocket server (container `:3000`, NAS commonly exposed as `:3002`), responsible for deterministic orchestration.
- **Speech + Planning**: STT produces transcript; an LLM (Gemini/LLM service) outputs a structured plan `{ tool, args }` under a locked system prompt.
- **Prompt integrity**: backend verifies the locked system prompt (SHA-256) at startup (fail-fast if modified).
- **Control4 bridge**: backend calls the separate `c4-mcp` HTTP server via `C4_MCP_BASE_URL` (repo boundary is the MCP contract only).
- **Clarification loop**: ambiguous tool results become `clarification-required`; UI returns `clarification-choice`; backend retries with stable IDs.

**3) Key modules and roles (bullet list)**
- `backend/src/services/ws-audio-pipeline.js`: core realtime orchestration (audio → STT → plan → MCP calls → clarification/retry).
- `backend/src/services/mcp-client.js`: `/mcp/list` caching + `/mcp/call` execution, timeouts, `X-Session-Id`, ambiguity extraction.
- `backend/src/routes/health.js`: `/api/v1/health` and `/api/v1/health/mcp`.
- `backend/src/services/llm.js`: validates/normalizes LLM output into the deterministic `{ tool, args }` contract.
- `frontend/js/app.js`: UI state machine (connected/recording/executing), clarification UI rendering.
- `frontend/js/voice.js`: mic capture (MediaRecorder + WAV fallback for compatibility).

**4) Data & contracts (top 3–5 only)**
- Auth: `POST /api/v1/auth/token` → JWT; UI uses `Authorization: Bearer <token>` and `wss://.../ws?token=...`.
- Voice: `POST /api/v1/voice/process` body `{ audioData: base64, format, sampleRateHertz? }`.
- Text: `POST /api/v1/voice/process-text` body `{ transcript: string }`.
- Plan contract: `{ tool: string, args: object }` (LLM output, then validated/normalized).
- Clarification contract: server emits `clarification-required` → client emits `clarification-choice` → server retries deterministically.

**5) APIs (key endpoints only)**
- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process`
- `POST /api/v1/voice/process-text`
- WebSocket: `/ws?token=...`

**6) Coding conventions (only the rules the AI must always follow)**
- Keep strict repo separation: `c4-mcp-app` never imports `c4-mcp`; it only talks over MCP HTTP.
- Keep the backend deterministic: do not add heuristic intent interpretation; ambiguities must round-trip through clarification.
- Never hardcode NAS IPs/ports in code; use env/config.
- Always pass a stable `X-Session-Id` to MCP (deviceId) so `*_last` tools work for follow-ups.
- Preserve the MCP payload shape `{ kind, name, args }` and treat tool-schema drift as a production risk.

**7) Current priorities (Top 5)**
1. Keep end-to-end reliability on NAS (HTTPS/WSS reverse proxy correctness; avoid mixed-content).
2. Make ambiguity handling correct and fast (single-match auto-resolve only when deterministic).
3. Keep follow-up commands (“it/that”) targeting the right room/device consistently.
4. Maintain tight MCP timeouts and clear errors (avoid “stuck executing”).
5. Keep deploys repeatable (compose builds, health checks, minimal manual DSM steps).

**8) Open risks/unknowns (Top 5)**
1. LLM/STT API quotas, latency spikes, and transient failures.
2. Browser mic codec/permission variability (especially iOS/Safari).
3. WebSocket upgrade issues under reverse proxy (timeouts, headers, buffering).
4. Tool/schema drift between planner/backend and `c4-mcp` deployments.
5. Follow-up context correctness when users select a clarification candidate (must persist stable IDs).

**9) Links/paths to full docs**
- `docs/project_overview.md`
- `docs/architecture.md`
- `docs/api/endpoints.md`
- `docs/ops/runbook.md`
- `docs/conventions_guardrails.md`
- `compose.nas.yaml`
- `README.md`
