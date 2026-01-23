
# PROJECT BOOTSTRAP SUMMARY — c4-mcp-app

**Last Updated:** January 23, 2026

**1) One-line purpose**
Provide a lightweight **voice + text UI** for Control4: the backend turns natural language into deterministic `c4-mcp` tool calls and streams results to a browser UI over WebSocket.

**2) Architecture overview (3–6 bullets)**
- **Frontend**: PWA static app (`frontend/`) captures audio/text and displays streaming progress.
- **Backend**: Node.js (Express) REST API + WebSocket server (reference NAS host port: `:3002`).
- **Cloud AI**: STT (Google/Azure) + OpenAI for intent parsing (default model `gpt-4o-mini`).
- **Control4 bridge**: separate `c4-mcp` HTTP server (reference NAS host port: `:3334`, container `:3333`).
- **Decoupled integration**: backend reaches `c4-mcp` only via `C4_MCP_BASE_URL` (no shared code between repos).
- **Disambiguation UX**: ambiguous targets emit `clarification-required` → UI prompts → UI sends `clarification-choice` → backend retries.

**3) Key modules and roles (bullet list)**
- `backend/src/server.js`: server entrypoint.
- `backend/src/app.js`: Express app wiring + middleware.
- `backend/src/routes/*`: REST endpoints (`health`, `auth`, `voice`).
- `backend/src/websocket.js`: WebSocket protocol (audio streaming, status events, clarification state).
- `backend/src/services/stt.js`: speech-to-text provider integration.
- `backend/src/services/llm.js`: intent parsing (structured `{ tool, args }`).
- `backend/src/services/mcp-client.js`: calls `c4-mcp` (`/mcp/list`, `/mcp/call`) and handles ambiguity.
- `frontend/js/*`: UI logic + WebSocket client + config.

**4) Data & contracts (top 3–5 only)**
- Voice request: `{ audioData: "<base64>", format?: "webm" }`.
- Plan: `{ tool: string, args: object }` (LLM output contract).
- MCP tool call: `{ kind:"tool", name:"<tool>", args:{...} }`.
- Clarification flow: `clarification-required` → `clarification-choice` (index-based selection).
- Auth: JWT `Authorization: Bearer <token>` for protected routes and `/ws?token=...`.

**5) APIs (key endpoints only)**
- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process`
- `POST /api/v1/voice/process-text`
- WebSocket: `/ws?token=...`

**6) Coding conventions (AI must always follow)**
- Use environment-driven config (`backend/src/config/index.js`); do not hardcode NAS IPs.
- Keep logs structured with correlation IDs; avoid logging secrets.
- Prefer `async/await` with explicit error mapping (consistent error codes + HTTP status).
- Keep the backend↔MCP contract stable (MCP payload shape and clarification schema).
- Maintain Jest tests and ESLint as regression gates.

**7) Current priorities (Top 5)**
1. Keep deployment unambiguous (avoid mixed old/new backend ports; validate `:3002` is the active build).
2. Ensure `C4_MCP_BASE_URL` is correct in container/LAN scenarios (`http://c4-mcp:3333` inside compose).
3. Validate WebSocket + clarification flows end-to-end in production.
4. Confirm write posture: `c4-mcp` writes enabled only when intended and guardrails enforced.
5. Stabilize key management (STT/OpenAI env vars; no secrets in repo).

**8) Open risks/unknowns (Top 5)**
1. External API cost/quotas (STT + OpenAI).
2. Browser audio codec variability (MediaRecorder formats differ).
3. WebSocket stability (mobile roaming, proxy timeouts, reverse-proxy config).
4. Ambiguity frequency in real homes (common room/device names).
5. Safety risk if ports are exposed beyond LAN (prefer firewall/VPN; never public internet by default).

**9) Links/paths to full docs**
- `docs/project_overview.md`
- `docs/architecture.md`
- `docs/api/endpoints.md`
- `docs/ops/runbook.md`
- `docs/conventions_guardrails.md`
- `compose.nas.yaml`
- `README.md` (repo root)
