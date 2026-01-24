# Context Pack — c4-mcp-app (C4 Voice Control)

**Last Updated:** January 23, 2026

**Deployment (NAS static IP):** `192.168.1.237`

- Backend REST base URL: `http://192.168.1.237:3002`
- Backend WebSocket URL: `ws://192.168.1.237:3002/ws?token=<jwt>`
- c4-mcp HTTP base URL (host port mapping): `http://192.168.1.237:3334`
- Local UI (served on your machine) pointing at NAS backend: `http://localhost:5173/?backend=http://192.168.1.237:3002`

## Mini executive summary (≤120 words)

c4-mcp-app is a lightweight voice + text UI for controlling a Control4 home. A PWA frontend streams audio/text to a Node.js backend (Express + WebSocket). The backend uses cloud STT to produce a transcript, then uses an LLM to produce a deterministic tool plan (`{ tool, args }`), and finally executes that plan by calling the separate `c4-mcp` HTTP server (`/mcp/call`). The repos remain fully decoupled: integration happens only over `C4_MCP_BASE_URL`. Conversational memory intentionally lives in `c4-mcp`; this app passes a stable per-device session identifier (deviceId) to `c4-mcp` via `X-Session-Id` so follow-ups like “turn it back on” can use `c4_lights_set_last`. Backend timeouts + a frontend watchdog prevent indefinite “executing…” hangs.

## Critical architecture bullets (≤6)

- Voice path: PWA mic → WS audio → backend STT → backend LLM plan → `c4-mcp` tool call → WS progress/results.
- Text path: PWA chat → `POST /api/v1/voice/process-text` → LLM plan → `c4-mcp` tool call.
- Decoupled boundary: only HTTP calls to `c4-mcp` (no shared code; configured via `C4_MCP_BASE_URL`).
- Session context: backend sends `X-Session-Id: <deviceId>` to `c4-mcp` for follow-ups.
- Ambiguity UX: backend emits `clarification-required`, UI replies `clarification-choice`, backend retries with scoped args.
- Anti-hang: backend enforces `C4_MCP_TIMEOUT_MS` and UI has a watchdog for stuck “executing”.

## Current working set (3–7 files/modules)

- `backend/src/services/mcp-client.js` — `c4-mcp` HTTP client (payload shape, timeouts, ambiguity handling, `X-Session-Id`).
- `backend/src/websocket.js` — WS protocol (audio streaming, progress events, clarification loop state).
- `backend/src/routes/voice.js` — REST voice/text entrypoints; passes deviceId/session id through pipeline.
- `backend/src/services/llm.js` — LLM prompt + `{ tool, args }` contract; follow-up behavior.
- `backend/src/services/voice-processor.js` — orchestration of STT → LLM → MCP execution.
- `frontend/js/app.js` — UI state machine + watchdog + clarification picker.
- `frontend/js/config.js` — deviceId/session id generation and client config.

## Interfaces/contracts that must not break

**Backend REST**

- `GET /api/v1/health`
- `GET /api/v1/health/mcp`
- `POST /api/v1/auth/token`
- `POST /api/v1/voice/process` body `{ audioData: "<base64>", format?: "webm" }`
- `POST /api/v1/voice/process-text` body `{ transcript: "..." }`

**WebSocket protocol (UI ↔ backend)**

- Connect: `ws://192.168.1.237:3002/ws?token=<jwt>` (or via reverse proxy WSS)
- Client → server: `audio-start`, `audio-chunk`, `audio-end`, `clarification-choice`, `ping`
- Server → client: `connected`, `processing`, `transcript`, `intent`, `clarification-required`, `command-complete`, `error`, `pong`

**Backend ↔ c4-mcp HTTP**

- List tools: `GET <C4_MCP_BASE_URL>/mcp/list`
- Call tool: `POST <C4_MCP_BASE_URL>/mcp/call` body `{ "kind": "tool", "name": "<tool>", "args": { ... } }`
- Session header: `X-Session-Id: <deviceId>` (required for follow-ups to work via `c4_lights_set_last`)

## Today’s objectives and acceptance criteria

**Objective A — Confirm the deployment is running the latest code**

- `GET /api/v1/health/mcp` reports the expected `C4_MCP_BASE_URL` and a non-zero tool count.
- WS `/ws` connects and emits `connected` promptly.

**Objective B — Eliminate “stuck executing…”**

- For any tool call, backend returns either `command-complete` or `error` within `C4_MCP_TIMEOUT_MS` + a small buffer.
- UI watchdog converts long-running executions into a visible error state (no permanent spinner).

**Objective C — Make follow-ups work without duplicating memory**

- “Turn off <room> lights” then “turn it back on” succeeds in the same browser session.
- Follow-up resolution uses `X-Session-Id` + `c4_lights_set_last` (no state duplication in this repo).

## Guardrails block (from conventions)

- Keep repos decoupled: never add shared code that couples `c4-mcp-app` to `c4-mcp` internals.
- Do not re-implement memory here; always rely on `c4-mcp` session memory via `X-Session-Id`.
- Do not break REST/WS/MCP payload shapes; changes must be additive and backwards-compatible.
- Keep all tool executions bounded: enforce `C4_MCP_TIMEOUT_MS`; never allow indefinite hangs.
- No secrets in git; only `.env`/deployment secrets stores.
- Keep tests/lint green (Jest + ESLint) for any backend changes.

## Links/paths for deeper docs

- `docs/project_overview.md`
- `docs/bootstrap_summary.md`
- `docs/architecture.md`
- `docs/api/endpoints.md`
- `docs/ops/runbook.md`
- `backend/README.md`

## Next Prompt to Paste

```text
Load context from docs/project_overview.md and docs/context_pack.md.

Today’s goal: verify “no hang” + follow-up memory behavior in production.

Steps:
1) Health: GET /api/v1/health and GET /api/v1/health/mcp (confirm C4_MCP_BASE_URL and toolCount).
2) WS: connect to /ws?token=... and confirm you receive connected then ping/pong works.
3) Text flow: send "turn off basement lights" then "turn it back on" and confirm the second command uses session context (X-Session-Id) and completes.
4) If anything hangs: capture backend logs by correlationId and confirm whether the MCP call timed out (C4_MCP_TIMEOUT_MS) or returned an error.

Constraints: keep contracts stable; keep repos decoupled; do not implement memory here; all operations must be time-bounded; keep changes minimal and test after edits.
```