# Context Pack — c4-mcp-app (C4 Voice Control)

**Last Updated:** January 29, 2026

**Deployment (current / may change):** Synology NAS `192.168.1.237`

- PWA UI (nginx/Web Station / reverse proxy): `https://192.168.1.237`
- Backend REST base URL (direct): `http://192.168.1.237:3002`
- Backend health: `GET http://192.168.1.237:3002/api/v1/health`
- Backend MCP health: `GET http://192.168.1.237:3002/api/v1/health/mcp`
- Backend WebSocket: `ws://192.168.1.237:3002/ws?token=<jwt>` (or `wss://192.168.1.237/ws?token=<jwt>` if proxy routes `/ws`)
- c4-mcp HTTP base URL (host port mapping): `http://192.168.1.237:3334`

**Production env/secrets (NAS Compose):** keep backend env vars in a stable external `env_file` (example: `/volume1/dockerc4-mcp/c4-voice-secrets/backend.env`) so redeploys/re-clones do not overwrite/corrupt runtime config.

## Mini executive summary (≤120 words)

c4-mcp-app is a lightweight voice + text UI for controlling Control4. A PWA frontend (served over HTTPS on the NAS) captures mic audio (MediaRecorder, with a WAV fallback for iOS/Safari) or sends text to a Node.js backend (Express + WebSocket). The backend uses cloud STT to produce a transcript, then uses an LLM (Gemini current) to produce a deterministic tool plan (`{ tool, args }`), and executes that plan by calling the separate `c4-mcp` HTTP server (`/mcp/call`). The repos remain decoupled: integration happens only over `C4_MCP_BASE_URL`. Conversational memory lives in `c4-mcp`; the app passes a stable per-device session id (deviceId) via `X-Session-Id` so follow-ups can use `*_last` tools. The backend enforces timeouts and the UI watchdog prevents “stuck executing…”.

Note: In production on the NAS, speech-to-text is expected to run via a local Whisper-compatible HTTP service (no cloud STT API key required). Cloud STT providers can be enabled via environment variables, but should not be required for normal operation.

## Critical architecture bullets (≤6)

- Voice: PWA mic → WS audio → backend STT (local Whisper on NAS) → backend LLM plan → `c4-mcp` tool call → WS results.
- Text: PWA chat → `POST /api/v1/voice/process-text` → LLM plan → `c4-mcp` tool call.
- Boundary: only HTTP calls to `c4-mcp` (no shared code; configured via `C4_MCP_BASE_URL`).
- Session: backend sends `X-Session-Id: <deviceId>` to `c4-mcp` for follow-ups.
- Ambiguity: backend emits `clarification-required`; UI replies `clarification-choice`; retry must use stable IDs; auto-resolve only on proven single match.
- Anti-hang: enforce `C4_MCP_TIMEOUT_MS` and a UI watchdog; startup enforces locked prompt integrity (SHA-256).

## Current working set (3–7 files/modules)

- `backend/src/services/mcp-client.js` — `c4-mcp` HTTP client (payload shape, timeouts, ambiguity handling, `X-Session-Id`).
- `backend/src/services/ws-audio-pipeline.js` — STT → LLM plan → MCP execute (+ deterministic single-match preflight).
- `backend/src/services/ws-clarification.js` — clarification storage + retry with refined args.
- `backend/src/websocket.js` — WS server wiring + heartbeat.
- `frontend/js/app.js` — UI state machine + watchdog + clarification picker.
- `nas/c4-mcp/overrides/app.py` — production hotfix layer for MCP tool compatibility (mounted into the c4-mcp container).

## Interfaces/contracts that must not break

**Backend REST**

- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process` body `{ audioData: "<base64>", format?: "webm"|"wav", sampleRateHertz?: number }`
- `POST /api/v1/voice/process-text` body `{ transcript: "..." }`

**WebSocket protocol (UI ↔ backend)**

- Connect: `/ws?token=<jwt>` (WS direct or WSS via reverse proxy)
- Client → server: `audio-start`, `audio-chunk`, `audio-end`, `clarification-choice`, `ping`
- Server → client: `connected`, `processing`, `transcript`, `intent`, `clarification-required`, `command-complete`, `error`, `pong`

**Backend ↔ c4-mcp HTTP**

- List tools: `GET <C4_MCP_BASE_URL>/mcp/list`
- Call tool: `POST <C4_MCP_BASE_URL>/mcp/call` body `{ "kind": "tool", "name": "<tool>", "args": { ... } }`
- Session header: `X-Session-Id: <deviceId>` (required for follow-ups via `c4_lights_set_last`, `c4_tv_off_last`, `c4_tv_remote_last`)

**Clarification + follow-up correctness**

- When a user picks a clarification candidate, the retry must use stable IDs (typically `room_id`, `device_id`) and remain schema-valid.
- Follow-ups like “turn it off” must not crash MCP due to argument drift.

## Today’s objectives and acceptance criteria

**Objective A — Confirm the deployment is running the latest code**

- `GET /api/v1/health/mcp` reports the expected `C4_MCP_BASE_URL` and a non-zero tool count.
- WS `/ws` connects and emits `connected` promptly.
Acceptance: UI loads over HTTPS and microphone permissions work.

**Objective B — Eliminate “stuck executing…”**

- For any tool call, backend returns either `command-complete` or `error` within `C4_MCP_TIMEOUT_MS` + a small buffer.
- UI watchdog converts long-running executions into a visible error state (no permanent spinner).

**Objective C — Make follow-ups work without duplicating memory**

- “Turn off <room> lights” then “turn it back on” succeeds in the same browser session.
- “Turn off the TV” then “mute it” succeeds in the same browser session.
- Follow-up resolution uses `X-Session-Id` + `*_last` tools (no state duplication in this repo).
Acceptance (TV follow-up): “Watch Roku Basement” (clarify if needed) then “turn it off” succeeds with no MCP 500.

## Guardrails block (from conventions)

- Node.js: Node 18+; avoid native addons.
- Keep repos decoupled; do not depend on `c4-mcp` internals.
- Do not implement memory here; rely on `c4-mcp` via `X-Session-Id`.
- Keep REST/WS/MCP payloads stable (additive only) and time-bounded (`C4_MCP_TIMEOUT_MS`).
- Prefer fixing schema drift at the MCP boundary (compat shims) vs backend heuristics.
- No secrets in git; keep Jest/ESLint green.

## Links/paths for deeper docs

- `docs/project_overview.md`
- `docs/bootstrap_summary.md`
- `docs/architecture.md`
- `backend/README.md`

## Next Prompt to Paste

```text
Load context from docs/project_overview.md and docs/context_pack.md.

Today’s goal: verify “no hang” + follow-up memory behavior in production.

Steps:
1) Health: GET /api/v1/health and GET /api/v1/health/mcp (confirm C4_MCP_BASE_URL and toolCount).
2) WS: connect to /ws?token=... and confirm you receive connected then ping/pong works.
3) Text flow: send "turn off basement lights" then "turn it back on" and confirm the second command uses session context (X-Session-Id) and completes.
4) TV flow: say "Watch Roku" → pick Roku Basement → then say "turn it off" and confirm no MCP 500.
5) If anything hangs/fails: capture backend logs by correlationId and confirm whether the MCP call timed out (C4_MCP_TIMEOUT_MS) or returned an error.

Constraints: keep contracts stable; keep repos decoupled; do not implement memory here; all operations must be time-bounded; keep changes minimal and test after edits.
```