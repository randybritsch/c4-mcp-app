# Backend Service Module

**Module ID:** BACKEND-001  
**Version:** 1.0.0  
**Status:** Planning  
**Last Updated:** January 19, 2026

> [← Back to Module Index](README.md) | [← Project Overview](../project_overview.md)

---

## 1. Overview {#overview}

### Purpose

The Backend Service is the central coordination layer that receives voice and text commands from the PWA, orchestrates cloud-based AI services (STT and LLM), translates natural language intents into MCP commands, and streams real-time status updates back to the client. It runs as a persistent Node.js process on the Synology DS218+.

### Key Characteristics

- **Technology:** Node.js v22 (Synology provided), code compatible with Node.js 18+
- **Framework:** Express.js or Fastify (pure JavaScript, no native addons)
- **Runtime:** Synology DS218+ (2GB RAM, dual-core CPU)
- **Architecture:** Monolithic service with modular internal structure
- **Communication:** REST API + WebSocket for bidirectional streaming
- **Process Management:** Synology Task Scheduler (boot-up script)
- **Dependencies:** Pure JavaScript packages only; avoid native C++ addons

### Dependencies

- **Upstream:** PWA Frontend (HTTP/WebSocket), Cloud STT API, Cloud LLM API
- **Downstream:** MCP Server (Control4 integration)
- **External:** Cloud APIs (Google/Azure STT, OpenAI/Anthropic LLM)

---

## 2. Responsibilities {#responsibilities}

### Core Functionality

- **API Gateway:** Expose REST endpoints for voice, chat, device status
- **WebSocket Server:** Maintain persistent connections for real-time updates
- **STT Integration:** Send audio to cloud STT service, receive transcripts
- **LLM Integration:** Send transcripts to cloud LLM, parse intents
- **MCP Coordination:** Translate intents to MCP commands, execute via MCP server
- **Authentication:** Validate tokens, manage sessions
- **Logging:** Structured logs for debugging and audit
- **Error Handling:** Graceful degradation, retry logic, user-friendly errors

### Boundaries (What It Does NOT Do)

- **No UI Rendering:** Only serves API responses
- **No Local AI Inference:** All AI processing delegated to cloud
- **No Long-Term Storage:** No database (logs only); state is ephemeral
- **No Direct Control4 Communication:** Uses MCP server as abstraction

### Upstream Dependencies

- PWA Frontend sends HTTP requests and WebSocket messages
- Cloud STT service converts audio to text
- Cloud LLM service parses intents from text

### Downstream Dependencies

- MCP Server executes commands on Control4 devices
- PWA Frontend receives responses via WebSocket

---

## 3. Interfaces {#interfaces}

### 3.1 Inputs

| Input | Format | Source | Protocol |
|-------|--------|--------|----------|
| Voice Audio | JSON + base64 | PWA Frontend | HTTPS POST |
| Text Command | JSON | PWA Frontend | HTTPS POST |
| WebSocket Control | JSON | PWA Frontend | WebSocket |
| STT Transcript | JSON | Cloud STT API | HTTPS Response |
| LLM Intent | JSON | Cloud LLM API | HTTPS Response |
| MCP Response | JSON | MCP Server | Protocol-specific |

### 3.2 Outputs

| Output | Format | Destination | Protocol |
|--------|--------|-------------|----------|
| Voice Response | JSON | PWA Frontend | HTTPS Response |
| Status Updates | JSON (streaming) | PWA Frontend | WebSocket |
| STT Request | Audio + metadata | Cloud STT API | HTTPS POST |
| LLM Request | Text prompt | Cloud LLM API | HTTPS POST |
| MCP Command | JSON/Protocol | MCP Server | Protocol-specific |
| Log Entries | JSON | Log file | File I/O |

### 3.3 REST API Endpoints

See [API Endpoints Documentation](../api/endpoints.md) for full specs. Summary:

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/v1/voice` | Submit voice audio | Required |
| POST | `/api/v1/chat` | Submit text message | Required |
| GET | `/api/v1/devices` | List Control4 devices | Required |
| GET | `/api/v1/status` | Get device states | Required |
| POST | `/api/v1/auth/login` | Authenticate user | No |
| GET | `/api/v1/health` | Health check | No |

### 3.4 WebSocket Protocol

**Connection:** `wss://home.yourdomain.com/api/v1/ws?token=<JWT>`

**Client → Server Messages:**

```json
{
  "type": "ping",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

**Server → Client Messages:**

```json
{
  "type": "transcript|intent|execution|error|status",
  "content": "Transcript or status message",
  "timestamp": "2026-01-19T10:30:01Z",
  "status": "success|pending|error"
}
```

### 3.5 Internal Module APIs

```javascript
// services/stt.js
async function transcribeAudio(audioBlob, format) 
  // Returns: { text: string, confidence: number }

// services/llm.js
async function parseIntent(transcript)
  // Returns: { action: string, device: string, parameters: object }

// services/mcp.js
async function executeCommand(intent)
  // Returns: { success: boolean, message: string }

// auth/auth.js
function validateToken(token)
  // Returns: { valid: boolean, user_id: string }
```

---

## 4. Data Models {#data-models}

### Voice Request (Received)

```json
{
  "audio": "base64-encoded-audio-data",
  "format": "webm",
  "duration_ms": 3500,
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

### Chat Request (Received)

```json
{
  "message": "Turn on the living room lights",
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

### STT Response (from Cloud API)

```json
{
  "results": [
    {
      "alternatives": [
        {
          "transcript": "Turn on the living room lights",
          "confidence": 0.96
        }
      ]
    }
  ]
}
```

### LLM Response (from Cloud API)

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"action\":\"turn_on\",\"device\":\"living_room_lights\",\"parameters\":{\"brightness\":100}}"
      }
    }
  ]
}
```

### Intent Object (Internal)

```json
{
  "action": "turn_on",
  "device": "living_room_lights",
  "parameters": {
    "brightness": 100,
    "color": "warm_white"
  },
  "confidence": 0.95
}
```

### MCP Command (to MCP Server)

```json
{
  "type": "command",
  "target": "device_id_12345",
  "action": "set_state",
  "params": {
    "state": "on",
    "brightness": 100
  }
}
```

### Validation Rules

- **audio:** Base64, max 5MB
- **format:** Must be `webm`, `wav`, or `mp3`
- **duration_ms:** Max 10000
- **message:** Max 500 characters, non-empty
- **device_id:** UUID v4 format

---

## 5. Failure Modes {#failure-modes}

| Failure Mode | Cause | Impact | Recovery Strategy |
|--------------|-------|--------|-------------------|
| **Cloud STT API fails** | Network error, rate limit, outage | Voice commands fail | Retry 2x with exponential backoff; return error to PWA |
| **Cloud LLM API fails** | Network error, rate limit, outage | Intent parsing fails | Retry 2x; fallback to simple keyword matching (optional); return error |
| **MCP Server unreachable** | Network error, MCP server down | Commands cannot execute | Retry 3x; log error; return error to PWA |
| **Invalid intent from LLM** | LLM returns unparseable JSON | Command fails | Log error; ask user to rephrase; send structured error to PWA |
| **Token expired** | JWT expired or invalid | API calls return 401 | PWA handles re-auth; backend logs attempt |
| **WebSocket disconnects** | Network interruption, timeout | Real-time updates stop | Client reconnects; backend maintains minimal state |
| **Memory exhaustion** | Too many concurrent requests | Service crashes | Limit concurrent requests (queue); monitor memory; restart via watchdog |
| **Large audio payload** | Audio >5MB | Request rejected | Return 413 (Payload Too Large); log warning |
| **Timeout (cloud APIs)** | STT/LLM takes >30s | User sees error | Timeout after 30s; return 504 Gateway Timeout; log |

### Degraded Operation Scenarios

1. **Cloud STT Unavailable:**
   - Return error: "Voice input temporarily unavailable"
   - Suggest text input as alternative
   - Log incident for monitoring

2. **Cloud LLM Unavailable:**
   - Attempt simple keyword matching (e.g., "turn on" + "lights")
   - If ambiguous, return error: "Please be more specific"
   - Log incident

3. **MCP Server Unreachable:**
   - Return error: "Cannot communicate with home system"
   - Retry in background
   - Alert user to check MCP server status

4. **High Load (>20% CPU):**
   - Queue incoming requests (max queue: 10)
   - Return 503 Service Unavailable if queue full
   - Log warning

---

## 6. Testing {#testing}

### Test Strategy

- **Unit Tests:** Individual functions (STT, LLM, MCP clients) - 70% coverage goal
- **Integration Tests:** Full API flows (voice → STT → LLM → MCP)
- **Contract Tests:** Verify API request/response formats match PWA expectations
- **Load Tests:** Simulate 5 concurrent users

### Key Test Cases

1. **Voice Command Flow:**
   - Receive audio → transcribe → parse intent → execute MCP → return success
   - Test with valid audio (3s, WebM format)
   - Verify WebSocket streams 4 messages (transcript, intent, execution, status)

2. **Text Command Flow:**
   - Receive text → parse intent → execute MCP → return success
   - Test with "Turn on bedroom lights"
   - Verify response in <2 seconds

3. **Error Handling:**
   - Invalid token → 401 Unauthorized
   - Cloud API timeout → 504 Gateway Timeout
   - MCP server down → 502 Bad Gateway
   - Invalid audio format → 400 Bad Request

4. **WebSocket:**
   - Client connects → server accepts and authenticates
   - Server sends message → client receives
   - Client disconnects → server cleans up

5. **Authentication:**
   - Valid JWT → auth passes
   - Expired JWT → 401 Unauthorized
   - Missing JWT → 401 Unauthorized

### Mock/Stub Requirements

- **MockSTTService:** Simulate cloud STT responses
- **MockLLMService:** Simulate cloud LLM responses
- **MockMCPServer:** Simulate MCP command execution
- **MockWebSocket:** Test WebSocket messaging without real connections

### Test Data

- **Sample Audio:** 3-second WebM file (base64-encoded)
- **Sample Transcripts:** "Turn on lights", "Set temperature to 72"
- **Sample Intents:** Various action/device/parameter combinations
- **Sample MCP Responses:** Success, failure, device not found

---

## 7. Observability {#observability}

### Logging Strategy

Use structured JSON logging (Winston or Pino).

**Log Levels:**

- **DEBUG:** Detailed flow (STT requests, LLM prompts, MCP commands)
- **INFO:** API requests, successful commands, authentication
- **WARN:** Retries, degraded operation, slow responses
- **ERROR:** Failed API calls, MCP errors, exceptions

**Example Log Entry:**

```json
{
  "timestamp": "2026-01-19T10:30:00Z",
  "level": "INFO",
  "message": "Voice command processed",
  "request_id": "req-xyz789",
  "device_id": "mobile-abc123",
  "action": "turn_on",
  "device": "living_room_lights",
  "latency_ms": 1523,
  "success": true
}
```

### Metrics to Track

| Metric | Description | Collection Method |
|--------|-------------|-------------------|
| **Request Count** | Total API requests | Increment counter per endpoint |
| **Error Rate** | % of failed requests | Count 4xx/5xx responses |
| **P95 Latency** | 95th percentile response time | Track request duration |
| **Cloud API Latency** | Time spent in STT/LLM calls | Measure external API calls |
| **MCP Command Success** | % of successful MCP executions | Track MCP response status |
| **WebSocket Connections** | Number of active connections | Count open sockets |
| **Memory Usage** | Heap size | `process.memoryUsage()` |
| **CPU Usage** | % utilization | OS metrics via `os.cpus()` |

### Telemetry Points

- **API Request Start/End:** Log request ID, endpoint, duration
- **Cloud API Call:** Log provider, endpoint, latency
- **MCP Command:** Log command type, device, result
- **WebSocket Event:** Log connect, disconnect, message count

### Debugging Hooks

- **Debug Endpoint:** `GET /api/v1/debug` (enabled in dev only)
  - Returns: current memory, CPU, active connections
- **Request Tracing:** Request ID in all logs and responses
- **Verbose Mode:** Enable via environment variable `LOG_LEVEL=DEBUG`

---

## 8. Performance & KPIs {#performance}

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Voice Command Latency** | < 3 seconds | Includes STT + LLM + MCP execution |
| **Text Command Latency** | < 2 seconds | Includes LLM + MCP execution |
| **WebSocket Message Latency** | < 100ms | Local network only |
| **API Request Throughput** | 5 concurrent users | With <2s avg latency |
| **Memory Usage** | < 256MB | DS218+ has 2GB total |
| **CPU Usage** | < 20% average | Dual-core CPU |
| **Startup Time** | < 10 seconds | From process start to ready |

### Resource Constraints

- **Max Memory:** 256MB (hard limit via Node.js `--max-old-space-size=256`)
- **Max Concurrent Requests:** 10 (queue additional requests)
- **Max WebSocket Connections:** 20 (reject new connections if exceeded)

### Key Performance Indicators

1. **Reliability:** Command success rate (target: >95%)
2. **Availability:** Service uptime (target: >99%)
3. **Latency:** P95 latency <3s (voice), <2s (text)
4. **Error Rate:** <5% of requests fail

### Optimization Notes

- **Connection Pooling:** Reuse HTTP connections to cloud APIs
- **Caching:** Cache device list for 60 seconds (reduce MCP queries)
- **Streaming:** Stream WebSocket messages as data arrives (don't batch)
- **Lazy Loading:** Load MCP client only when first command received

---

## 9. Configuration {#configuration}

### Environment Variables

File: `/volume1/apps/c4-mcp-app/backend/.env`

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP server port | `3001` | No |
| `NODE_ENV` | Environment (development/production) | `production` | No |
| `LOG_LEVEL` | Logging level (DEBUG/INFO/WARN/ERROR) | `INFO` | No |
| `STT_PROVIDER` | STT service (google/azure/aws) | `google` | Yes |
| `STT_API_KEY` | Cloud STT API key | - | Yes |
| `LLM_PROVIDER` | LLM service (openai/anthropic) | `openai` | Yes |
| `LLM_API_KEY` | Cloud LLM API key | - | Yes |
| `LLM_MODEL` | Model name (gpt-4, claude-3-opus) | `gpt-4` | Yes |
| `MCP_SERVER_URL` | MCP server endpoint | `http://192.168.1.200:8080` | Yes |
| `MCP_API_KEY` | MCP server auth token (if required) | - | No |
| `JWT_SECRET` | Secret for signing JWTs | - | Yes |
| `JWT_EXPIRY` | Token expiry duration | `30d` | No |
| `MAX_AUDIO_SIZE` | Max audio size in bytes | `5242880` (5MB) | No |
| `REQUEST_TIMEOUT` | Timeout for external API calls (ms) | `30000` | No |

### Configuration File (Optional)

`config/default.json`:

```json
{
  "server": {
    "port": 3001,
    "cors": {
      "origin": "*",
      "methods": ["GET", "POST", "OPTIONS"]
    }
  },
  "cloudAPIs": {
    "stt": {
      "retries": 2,
      "timeout": 10000
    },
    "llm": {
      "retries": 2,
      "timeout": 15000,
      "systemPrompt": "You are a Control4 home automation assistant..."
    }
  },
  "mcp": {
    "retries": 3,
    "timeout": 5000
  }
}
```

---

## 10. Operational Notes {#operations}

### Deployment Steps (Synology DS218+)

1. **Install Node.js:**
   - Install via Synology Package Center (Node.js v18)
   - Or manually via SSH: `wget` and extract Node.js binary

2. **Upload Backend Code:**
   ```bash
   scp -r backend/ admin@<NAS_IP>:/volume1/apps/c4-mcp-app/
   ```

3. **Install Dependencies:**
   ```bash
   ssh admin@<NAS_IP>
   cd /volume1/apps/c4-mcp-app/backend
   npm install --production
   ```

4. **Configure Environment:**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your API keys
   chmod 600 .env
   ```

5. **Create Startup Script:**
   ```bash
   nano /volume1/apps/c4-mcp-app/scripts/start-backend.sh
   ```
   
   Content:
   ```bash
   #!/bin/bash
   cd /volume1/apps/c4-mcp-app/backend
   /usr/local/bin/node src/server.js >> /var/log/c4-mcp-app.log 2>&1 &
   ```

6. **Configure Task Scheduler:**
   - DSM → Control Panel → Task Scheduler
   - Create → Triggered Task → User-defined script
   - Event: Boot-up
   - Script: `/volume1/apps/c4-mcp-app/scripts/start-backend.sh`

7. **Start Service:**
   ```bash
   sudo /volume1/apps/c4-mcp-app/scripts/start-backend.sh
   ```

8. **Verify:**
   ```bash
   curl http://localhost:3001/api/v1/health
   # Expected: {"status":"ok"}
   ```

### Common Issues and Troubleshooting

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| **Service won't start** | No process running | Check logs: `tail -f /var/log/c4-mcp-app.log`; verify Node.js installed |
| **Port already in use** | Error: EADDRINUSE | Change `PORT` in `.env`; check for zombie processes |
| **Cloud API errors** | 401/403 responses | Verify API keys in `.env`; check API quota |
| **MCP server unreachable** | 502 Bad Gateway | Verify `MCP_SERVER_URL`; check network; test with `curl` |
| **Memory errors** | Heap out of memory | Increase `--max-old-space-size`; reduce concurrent requests |
| **Slow responses** | Latency >5s | Check cloud API latency; optimize prompts; upgrade network |

### Maintenance Tasks

- **Daily:** Check logs for errors: `grep ERROR /var/log/c4-mcp-app.log`
- **Weekly:** Monitor memory usage: `ps aux | grep node`
- **Monthly:** Rotate logs: `logrotate /var/log/c4-mcp-app.log`
- **Quarterly:** Update dependencies: `npm update`

### Scaling Considerations

- **Single Instance:** DS218+ can handle 1 instance (5 concurrent users)
- **Vertical Scaling:** Not feasible (hardware limit)
- **Horizontal Scaling:** Not needed for home use; if needed, move to cloud VM

---

## Change History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-19 | Initial specification | Randy Britsch |

---

## Related Documents

- [← Module Index](README.md)
- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [API Endpoints](../api/endpoints.md)
- [MCP Client Module](mcp-client.md)
- [Cloud Integration Module](cloud-integration.md)

---

**Maintained By:** Randy Britsch  
**Questions/Issues:** File issue in project repo
