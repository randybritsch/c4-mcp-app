# CONVENTIONS & GUARDRAILS

**Copy-paste this block into all coding prompts to enforce project standards.**

---

## Language & Frameworks
- **Node.js:** v22 (production), write code compatible with Node.js 18+
- **Dependencies:** Pure JavaScript only—NO native addons (no `bcrypt`, `sqlite3`, `sharp`, `node-sass`)
- **Style:** Airbnb ESLint config, Prettier formatting, 2-space indentation
- **Async:** Always `async/await`, never bare Promises or callbacks

## Directory & File Naming
- **Folders:** `kebab-case` (`mcp-client/`, `api-handlers/`)
- **Files:** `kebab-case.js` (`voice-processor.js`, `auth-middleware.js`)
- **Tests:** `*.test.js` co-located with source files
- **Config:** Root-level `.env` (never commit), `config/*.js` for app settings

## Error Handling & Logging
- **Errors:** Structured with `code`, `message`, `details` (e.g., `USER_INPUT_ERROR`, `STT_TIMEOUT`)
- **Logging:** Winston JSON format, levels: `error|warn|info|debug`
- **Required Fields:** `timestamp`, `level`, `correlationId`, `message`, `context`
- **Correlation IDs:** UUID v4, propagate through all async calls
- **No console.log:** Use `logger.info()` or `logger.error()` only

## Testing
- **Framework:** Jest, 80%+ coverage target
- **Structure:** Unit tests for all functions, integration tests for API endpoints
- **Mocks:** Mock all external APIs (STT, LLM, MCP, Control4)
- **Run:** `npm test` before every commit

## Security & Privacy
- **Auth:** JWT tokens, 7-day expiry, validate on every request
- **Middleware:** Helmet (security headers), CORS whitelist, rate limiting (60 req/min)
- **Secrets:** Environment variables only (`.env`), never hardcode
- **Input Validation:** Sanitize all user inputs before processing

## Performance & Constraints
- **Memory:** Backend <256MB RAM (DS218+ constraint)
- **Latency:** STT+LLM roundtrip <3s (P95), WebSocket response <500ms
- **Concurrency:** Max 10 WebSocket connections, rate limit REST to 60 req/min
- **Optimize:** Stateless backend, no in-memory caching (use Redis if needed)

## Commit & PR Format
- **Commit:** `type(scope): description` (e.g., `feat(api): add voice endpoint`, `fix(ws): reconnect logic`)
- **Types:** `feat|fix|docs|style|refactor|test|chore`
- **PR Template:** What/Why/How/Testing/Risks/Rollback sections

## Documentation
- **New Modules:** Add to `/docs/modules/[module-name].md` with purpose, interfaces, failure modes, tests
- **API Changes:** Update `/docs/api/endpoints.md` with examples, error codes
- **Breaking Changes:** Document in `/docs/roadmap.md` and migration plan

---

**Word Count:** ~290 words  
**Usage:** Paste this block at the start of coding prompts to ensure AI follows all project standards consistently.
