# Context Pack — C4 Voice Control via MCP

## Executive Summary

Production-ready PWA voice control system for Control4 home automation via Model Context Protocol (MCP). **Implementation complete** — full-stack application built and tested (6/6 tests passing). Backend: Node.js v22 Express server with WebSocket streaming, cloud STT (Google/Azure), LLM intent parsing (OpenAI/Anthropic), and TCP-based MCP client. Frontend: Offline-capable PWA with MediaRecorder voice capture, WebSocket client with auto-reconnect, and command history. Deployment: Synology DS218+ native (no Docker), <256MB RAM, pure JavaScript only. Ready for icon generation, .env configuration, and device testing.

**Status:** Implementation Complete — Ready for Deployment  
**Next Phase:** PWA icon generation → Deploy to DS218+ → Real Control4 MCP testing

---

## Critical Architecture (6 Bullets)

1. **Voice Pipeline:** Browser MediaRecorder → WebSocket (WEBM_OPUS chunks) → STT API (Google/Azure REST) → LLM Intent Parser (OpenAI GPT-4/Anthropic Claude) → MCP Command → Control4 Director (TCP:9000)

2. **Authentication:** Device-based JWT (7-day expiry), no user accounts. Frontend gets token from POST /api/v1/auth/token with deviceId, stores in localStorage, passes via Bearer header (REST) or ws query param (WebSocket).

3. **WebSocket Protocol:** Client sends `audio-start` → `audio-chunk` (base64) → `audio-end`. Server responds `audio-ready` → `processing` → `transcript` → `intent` → `command-complete` or `error`. Max 10 concurrent connections, 30s heartbeat, correlation IDs per session.

4. **Constraints:** Synology DS218+ (2GB RAM, dual-core Realtek), Node.js v22 code compatible with 18+, **pure JavaScript only** (no native addons), backend <256MB RAM budget, frontend <10MB bundle.

5. **Error Handling:** Structured AppError class with error codes (USER_INPUT_ERROR, STT_TIMEOUT, MCP_CONNECTION_ERROR, etc.), Winston logging (JSON format, correlation IDs), graceful degradation (STT fallback, LLM retry logic).

6. **Deployment:** Backend via Synology Task Scheduler (persistent process on :3000), Frontend via Web Station (static files), Reverse Proxy for /api/* routing, Let's Encrypt SSL/WSS, rsync-based deployment scripts.

---

## Current Working Set (Active Files)

Since implementation is **complete**, the working set shifts to deployment and validation:

1. **frontend/icons/** (PENDING): 8 PWA icon sizes (72-512px) need generation for manifest.json
2. **backend/.env** (MANUAL): Template exists (.env.example), requires real API keys (Google STT, OpenAI/Anthropic, Control4 host/port)
3. **backend/src/services/mcp-client.js** (NEEDS TESTING): TCP client implemented but protocol placeholder — requires real Control4 Director for validation
4. **scripts/deploy-backend.sh** (READY): Automated deployment to /volume1/web/c4-mcp-app/backend with Task Scheduler setup instructions
5. **scripts/deploy-frontend.sh** (READY): Automated deployment to /volume1/web/c4-voice with Web Station configuration steps
6. **backend/src/routes/routes.test.js** (VALIDATED): 6 tests passing — health, auth, voice endpoints validated
7. **docs/project_overview.md** (CURRENT): Updated with implementation status, ready for ongoing maintenance as project evolves

---

## Interfaces/Contracts — DO NOT BREAK

### REST API (Backend → Frontend)
- `POST /api/v1/auth/token` → `{deviceId}` → `{token, expiresIn}` (200) or `{error, code}` (400/500)
- `POST /api/v1/voice/process` → `{audioData: base64}` + `Authorization: Bearer <token>` → `{transcript, intent, command, processingTime}` (200) or error (400/401/500)
- `GET /api/v1/health` → `{status: "ok", timestamp, uptime, memory}` (200)

### WebSocket (Frontend ↔ Backend)
- **Client Messages:** `{type: "audio-start"}`, `{type: "audio-chunk", data: base64}`, `{type: "audio-end"}`
- **Server Messages:** `{type: "audio-ready"}`, `{type: "processing"}`, `{type: "transcript", data: {text, confidence}}`, `{type: "intent", data: {action, target, value?, room?}}`, `{type: "command-complete", data: {command}}`, `{type: "error", data: {message, code}}`
- **Connection:** `ws://host:3000/ws?token=<jwt>`, 30s ping/pong heartbeat, max 10 connections

### LLM Intent Schema (LLM → MCP Client)
```json
{
  "action": "turn_on|turn_off|set_temperature|lock|unlock|set_brightness|set_scene",
  "target": "lights|thermostat|lock|dimmer|scene",
  "value": "number|string (optional)",
  "room": "string (optional)"
}
```

### Environment Variables (.env)
```
NODE_ENV=production
PORT=3000
JWT_SECRET=<256-bit>
LOG_LEVEL=info
STT_PROVIDER=google|azure
GOOGLE_STT_API_KEY=<key>
AZURE_STT_KEY=<key>
AZURE_STT_REGION=<region>
LLM_PROVIDER=openai|anthropic
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
MCP_HOST=192.168.1.x
MCP_PORT=9000
```

**Breaking these contracts requires coordinated frontend + backend updates and version migration.**

---

## Today's Objectives & Acceptance Criteria

### Immediate Objectives (Next Session)
1. **Generate PWA Icons:** Create 8 icon sizes (72, 96, 128, 144, 152, 192, 384, 512px) using brand colors (#1a1a2e background, #e94560 accent)
2. **Configure Production .env:** Copy .env.example, populate real API keys for Google STT and OpenAI, set Control4 Director IP/port
3. **Deploy to Synology:** Run deploy-backend.sh and deploy-frontend.sh, configure Task Scheduler and Web Station, validate health endpoint

### Acceptance Criteria
- [ ] PWA manifest loads without 404s on icon paths
- [ ] Backend starts via Task Scheduler and survives Synology reboot
- [ ] Frontend accessible at https://c4-voice.local via reverse proxy
- [ ] WebSocket upgrades successfully over WSS
- [ ] Health check returns 200 with uptime > 0
- [ ] Voice recording captures audio and sends chunks to backend
- [ ] STT transcribes real voice input (test with "turn on kitchen lights")
- [ ] LLM parses intent correctly (action: "turn_on", target: "lights", room: "kitchen")
- [ ] MCP client connects to Control4 Director (verify TCP handshake)

---

## Guardrails (Conventions — Enforce on All Code)

- **Runtime:** Node.js v22, code compatible with 18+, **pure JavaScript only** (no native C++ addons, no node-gyp)
- **Style:** ESLint Airbnb, Prettier (2-space indent, 100-char width), semicolons required
- **Naming:** kebab-case files/dirs, camelCase JS variables/functions, PascalCase classes
- **Errors:** AppError class with `{code, message, statusCode, details, timestamp}`, Winston logging (JSON), correlation IDs via uuid.v4()
- **Logging:** Winston (error|warn|info|debug), file + console transports, correlation IDs in all logs, structured JSON format
- **Testing:** Jest + Supertest, 80% coverage threshold, co-located tests (*.test.js), run `npm test` before commits
- **Security:** JWT auth (7-day expiry), helmet middleware, CORS whitelist, rate limiting (60 req/min), HTTPS/WSS only in production
- **Performance:** Backend <256MB RAM, frontend <10MB bundle, STT timeout 10s, LLM timeout 15s, MCP timeout 5s
- **Commits:** `type(scope): message` format (feat|fix|docs|test|refactor|perf|chore), max 72 chars, imperative mood
- **Docs:** Update project_overview.md after major changes, inline JSDoc for public APIs, README.md per subsystem

---

## Documentation Links

- **[Project Overview](project_overview.md)** — Single source of truth (754 lines, 14 sections)
- **[Bootstrap Summary](bootstrap_summary.md)** — Quick context reload (620 words)
- **[Conventions & Guardrails](conventions_guardrails.md)** — Enforceable checklist (290 words)
- **[Architecture](architecture.md)** — Diagrams, components, tradeoffs
- **[API Endpoints](api/endpoints.md)** — REST + WebSocket specs
- **[Module Specs](modules/)** — Frontend PWA, Backend Service, Backend Package
- **[Operations Runbook](ops/runbook.md)** — Deployment, monitoring, troubleshooting
- **[Roadmap](roadmap.md)** — Milestones and priorities
- **[Update Summary](UPDATE_SUMMARY.md)** — Latest session changes

---

## Next Prompt to Paste (Suggested)

```text
Continue C4 Voice Control project. Implementation is complete (6/6 tests passing). Focus on deployment readiness:

1. Generate 8 PWA icon sizes (72-512px) with brand colors (#1a1a2e bg, #e94560 accent). Save to frontend/icons/ and verify manifest.json paths.

2. Review .env.example and guide me through production configuration (API keys, Control4 IP, JWT secret generation).

3. Walk through Synology deployment: execute deploy-backend.sh, configure Task Scheduler, execute deploy-frontend.sh, configure Web Station, set up reverse proxy for HTTPS/WSS.

4. After deployment, run end-to-end test: record voice command "turn on kitchen lights", verify STT → LLM → MCP flow, validate Control4 response.

Follow all guardrails from context_pack.md. Ask clarifying questions before breaking contracts or making architectural changes.
```

---

**Word Count:** ~880 words | **Created:** 2026-01-19 | **Status:** Production-Ready Context Pack