# API Endpoints Documentation

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 23, 2026

> [← Back to Project Overview](../project_overview.md)

---

## Table of Contents

1. [Authentication](#authentication)
2. [REST Endpoints](#rest-endpoints)
3. [WebSocket Protocol](#websocket)
4. [Error Codes](#error-codes)
5. [Rate Limiting](#rate-limiting)

---

## 1. Authentication {#authentication}

### Authentication Flow

The API uses **JWT (JSON Web Token)** for authentication.

```
┌──────────┐                    ┌─────────────┐
│  Client  │                    │   Backend   │
└─────┬────┘                    └──────┬──────┘
      │                                │
      │ POST /api/v1/auth/token        │
      │ { deviceId: "..." }            │
      │───────────────────────────────>│
      │                                │
      │                     ┌──────────▼────────┐
      │                     │ Generate JWT      │
      │                     │ (or never-expire) │
      │                     └──────────┬────────┘
      │                                │
      │ 200 OK                         │
      │ { token: "eyJhbG..." }         │
      │<───────────────────────────────│
      │                                │
      │ Store token                    │
      │                                │
      │ GET /api/v1/devices            │
      │ Authorization: Bearer eyJhbG...│
      │───────────────────────────────>│
      │                                │
      │                     ┌──────────▼────────┐
      │                     │ Validate JWT      │
      │                     └──────────┬────────┘
      │                                │
      │ 200 OK + device list           │
      │<───────────────────────────────│
      │                                │
```

### Token Format

**JWT Structure:**
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "deviceId": "mobile-abc123",
    "deviceName": "My Phone",
    "issuedAt": "2026-01-23T10:30:00Z",
    "iat": 1705660800
  }
}
```

### Including Tokens in Requests

**HTTP Headers:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**WebSocket Query Parameter:**
```
ws://<host>:<port>/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 2. REST Endpoints {#rest-endpoints}

### Base URL

- **Production (LAN):** `http://<NAS_IP>:3002/api/v1`
- **Local Development:** `http://localhost:3000/api/v1`

---

### 2.1 POST `/api/v1/auth/token`

Authenticate a device and receive a JWT token.

**Auth Required:** No

**Request:**

```http
POST /api/v1/auth/token HTTP/1.1
Content-Type: application/json

{
  "deviceId": "mobile-abc123",
  "deviceName": "My Phone"
}
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2VfaWQiOiJtb2JpbGUtYWJjMTIzIiwiaWF0IjoxNzA1NjYwODAwLCJleHAiOjE3MDgyNTI4MDB9.xyz",
  "expiresIn": "never"
}
```

**Error Responses:**

- `400 Bad Request`: Missing or invalid `deviceId`
- `500 Internal Server Error`: Token generation failed

---

### 2.2 POST `/api/v1/voice/process`

Submit voice audio for processing.

**Auth Required:** Yes

**Request:**

```http
POST /api/v1/voice/process HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "audioData": "GkXfo59ChoEBQveBAULygQRC84EIQoKE...",
  "format": "webm"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audioData` | string | Yes | Base64-encoded audio data (max 5MB) |
| `format` | string | Yes | Audio format (`webm`, `wav`, `mp3`) |
| `duration_ms` | number | No | Optional client-side duration metadata |

**Response (200 OK):**

```json
{
  "transcript": "Turn on the living room lights",
  "confidence": 0.92,
  "plan": { "tool": "c4_room_lights_set", "args": { "room_name": "Living Room", "state": "on" } },
  "command": { "success": true, "tool": "c4_room_lights_set", "args": { "room_name": "Living Room", "state": "on" } },
  "processingTime": 1340,
  "timestamp": "2026-01-23T10:30:00Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Unique request identifier for tracking |
| `status` | string | `processing`, `success`, or `error` |
| `message` | string | Human-readable status message |

Note: The PWA primarily uses the **WebSocket** pipeline (see section 3) for real-time progress updates. This REST endpoint is a synchronous alternative.

**Error Responses:**

- `400 Bad Request`: Invalid audio format, missing fields, or audio too large
- `401 Unauthorized`: Invalid or expired token
- `413 Payload Too Large`: Audio exceeds 5MB
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing failed

---

### 2.3 POST `/api/v1/voice/process-text`

Submit a text command for processing (skips STT).

**Auth Required:** Yes

**Request:**

```http
POST /api/v1/voice/process-text HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "transcript": "Turn on the living room lights"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transcript` | string | Yes | User's text command |

**Response (200 OK):**

```json
{
  "transcript": "Turn on the living room lights",
  "plan": { "tool": "c4_room_lights_set", "args": { "room_name": "Living Room", "state": "on" } },
  "command": { "success": true, "tool": "c4_room_lights_set", "args": { "room_name": "Living Room", "state": "on" } },
  "timestamp": "2026-01-23T10:30:00Z"
}
```

**Status Updates:** For real-time progress + interactive clarification, prefer the WebSocket protocol.

**Clarification loop (Option C):**

- If the Control4 command is ambiguous (e.g., multiple rooms match "Basement"), the backend emits `clarification-required` over WebSocket with a candidate list.
- The client responds with `clarification-choice` (an index) and the backend retries with stricter parameters.

**Error Responses:**

- `400 Bad Request`: Empty message or exceeds 500 characters
- `401 Unauthorized`: Invalid or expired token
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing failed

---

### 2.4 GET `/api/v1/devices` (Planned)

Retrieve list of available Control4 devices.

Status: **Not implemented** in the current build (expect `404`).

**Auth Required:** Yes

**Request:**

```http
GET /api/v1/devices HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**

```json
{
  "devices": [
    {
      "id": "device_12345",
      "name": "Living Room Lights",
      "type": "light",
      "room": "Living Room",
      "capabilities": ["on_off", "dimming", "color"],
      "state": {
        "power": "on",
        "brightness": 80,
        "color": "warm_white"
      }
    },
    {
      "id": "device_67890",
      "name": "Bedroom Thermostat",
      "type": "thermostat",
      "room": "Bedroom",
      "capabilities": ["temperature", "mode"],
      "state": {
        "temperature": 72,
        "mode": "auto"
      }
    }
  ],
  "total": 2
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `devices` | array | Array of device objects |
| `devices[].id` | string | Unique device identifier |
| `devices[].name` | string | User-friendly device name |
| `devices[].type` | string | Device type (`light`, `thermostat`, `lock`, etc.) |
| `devices[].room` | string | Room/zone name |
| `devices[].capabilities` | array | Supported actions |
| `devices[].state` | object | Current device state |
| `total` | number | Total number of devices |

**Error Responses:**

- `401 Unauthorized`: Invalid or expired token
- `502 Bad Gateway`: Cannot reach MCP server
- `500 Internal Server Error`: Failed to retrieve devices

---

### 2.5 GET `/api/v1/status` (Planned)

Get current state of all devices or a specific device.

Status: **Not implemented** in the current build (expect `404`).

**Auth Required:** Yes

**Request:**

```http
GET /api/v1/status?device_id=device_12345 HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `device_id` | string | No | If specified, return status for one device only |

**Response (200 OK):**

```json
{
  "timestamp": "2026-01-19T10:35:00Z",
  "devices": [
    {
      "id": "device_12345",
      "name": "Living Room Lights",
      "state": {
        "power": "on",
        "brightness": 80
      },
      "last_updated": "2026-01-19T10:30:01Z"
    }
  ]
}
```

**Error Responses:**

- `401 Unauthorized`: Invalid or expired token
- `404 Not Found`: Device ID not found
- `502 Bad Gateway`: Cannot reach MCP server

---

### 2.6 GET `/api/v1/health`

Health check endpoint (no authentication required).

**Auth Required:** No

**Request:**

```http
GET /api/v1/health HTTP/1.1
```

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2026-01-23T10:30:00Z",
  "uptime": 123.45,
  "nodeVersion": "v22.x"
}
```

**Response (502 Bad Gateway):**

```json
{
  "status": "degraded",
  "mcp": {
    "error": "MCP server unreachable"
  },
  "timestamp": "2026-01-23T10:30:00Z"
}

---

### 2.7 GET `/api/v1/health/mcp`

Checks connectivity to the `c4-mcp` server and returns a tool count/sample.

**Auth Required:** No

**Request:**

```http
GET /api/v1/health/mcp HTTP/1.1
```

---

## 3. WebSocket Protocol {#websocket}

### Connection

**Endpoint:** `ws://<host>:<port>/ws`

**Authentication:**

Include JWT token as query parameter:

```
ws://<host>:<port>/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Connection Flow:**

```javascript
const ws = new WebSocket('ws://<host>:<port>/ws?token=' + token);

ws.onopen = () => {
  console.log('WebSocket connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket disconnected');
  // Implement reconnection logic
};
```

---

### Message Types (Server → Client)

These are the message types currently emitted by the backend WebSocket server.

#### connected

Sent immediately after a successful WebSocket connection.

```json
{ "type": "connected", "correlationId": "...", "message": "WebSocket connection established" }
```

#### audio-ready

Sent after `audio-start` to confirm the server is ready for chunks.

```json
{ "type": "audio-ready", "message": "Ready to receive audio" }
```

#### processing

Progress updates while the pipeline runs.

```json
{ "type": "processing", "stage": "transcription" }
```

Stages are typically: `transcription` → `intent-parsing` → `executing`.

#### transcript

```json
{ "type": "transcript", "transcript": "Turn on the basement lights", "confidence": 0.93 }
```

#### intent

```json
{ "type": "intent", "intent": { "tool": "c4_room_lights_set", "args": { "room_name": "Basement", "state": "on" } } }
```

#### command-complete

```json
{ "type": "command-complete", "result": { "success": true, "tool": "c4_room_lights_set", "args": { "room_name": "Basement", "state": "on" } }, "transcript": "...", "intent": { "tool": "...", "args": { } } }
```

#### clarification-required

Sent when the MCP command was ambiguous and needs a user choice.

```json
{
  "type": "clarification-required",
  "transcript": "Turn on the basement lights",
  "intent": { "tool": "c4_room_lights_set", "args": { "room_name": "Basement", "state": "on" } },
  "clarification": {
    "kind": "room",
    "query": "Basement",
    "message": "Multiple matches found",
    "candidates": [
      { "name": "Basement Stairs", "room_id": 123, "score": 98 },
      { "name": "Basement Bathroom", "room_id": 124, "score": 90 }
    ]
  }
}
```

#### error

```json
{ "type": "error", "code": "PROCESSING_ERROR", "message": "..." }
```

---

### Message Types (Client → Server)

#### audio-start

Starts an audio capture session.

```json
{ "type": "audio-start" }
```

#### audio-chunk

Sends a chunk of base64 audio data.

```json
{ "type": "audio-chunk", "data": "...base64..." }
```

#### audio-end

Ends the audio capture session and triggers processing.

```json
{ "type": "audio-end" }
```

#### clarification-choice

Sends the selected candidate index from `clarification-required`.

```json
{ "type": "clarification-choice", "choiceIndex": 0 }
```

#### ping / pong

```json
{ "type": "ping" }
```

---

### Reconnection Strategy

If WebSocket disconnects:

1. Wait 2 seconds
2. Attempt reconnection
3. If fails, wait 4 seconds
4. Attempt reconnection
5. If fails, wait 8 seconds
6. If 3 consecutive failures, show persistent error to user

**Example:**

```javascript
let reconnectAttempts = 0;
const maxAttempts = 3;
const backoff = [2000, 4000, 8000];

function connect() {
  const ws = new WebSocket('wss://...');
  
  ws.onopen = () => {
    reconnectAttempts = 0;
  };
  
  ws.onclose = () => {
    if (reconnectAttempts < maxAttempts) {
      const delay = backoff[reconnectAttempts];
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(connect, delay);
      reconnectAttempts++;
    } else {
      console.error('Max reconnection attempts reached');
    }
  };
}
```

---

## 4. Error Codes {#error-codes}

### HTTP Status Codes

| Code | Name | Description |
|------|------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request format or parameters |
| 401 | Unauthorized | Missing, invalid, or expired token |
| 403 | Forbidden | Token valid but insufficient permissions |
| 404 | Not Found | Resource not found (e.g., device ID) |
| 413 | Payload Too Large | Audio exceeds 5MB |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected error on server |
| 502 | Bad Gateway | Cannot reach MCP server |
| 503 | Service Unavailable | Server overloaded or degraded |
| 504 | Gateway Timeout | Cloud API or MCP server timeout |

### Application Error Codes

Custom error codes in response body:

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_TOKEN_INVALID` | Token signature invalid | 401 |
| `AUTH_TOKEN_EXPIRED` | Token has expired | 401 |
| `AUDIO_FORMAT_INVALID` | Unsupported audio format | 400 |
| `AUDIO_TOO_LARGE` | Audio exceeds 5MB | 413 |
| `AUDIO_TOO_LONG` | Audio exceeds 10 seconds | 400 |
| `MESSAGE_TOO_LONG` | Text message exceeds 500 chars | 400 |
| `STT_FAILED` | Speech-to-text service error | 500 |
| `LLM_FAILED` | LLM service error | 500 |
| `INTENT_PARSE_ERROR` | Cannot parse intent from LLM | 500 |
| `MCP_UNREACHABLE` | Cannot connect to MCP server | 502 |
| `MCP_COMMAND_FAILED` | MCP command execution failed | 500 |
| `DEVICE_NOT_FOUND` | Device ID not found | 404 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

**Error Response Format:**

```json
{
  "error": {
    "code": "INTENT_PARSE_ERROR",
    "message": "Failed to parse intent: ambiguous command",
    "details": "LLM returned unparseable JSON",
    "request_id": "req-xyz789",
    "timestamp": "2026-01-19T10:30:02Z"
  }
}
```

---

## 5. Rate Limiting {#rate-limiting}

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/v1/voice/process` | 30 requests | Per minute per device |
| `/api/v1/voice/process-text` | 60 requests | Per minute per device |
| `/api/v1/auth/token` | 10 requests | Per minute per IP |

### Rate Limit Headers

Included in all responses:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705660860
```

### Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again in 30 seconds.",
    "limit": 60,
    "window": "1 minute",
    "retry_after": 30
  }
}
```

---

## Related Documents

- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [Data Contracts](../data/contracts.md)
- [Backend Service Module](../modules/backend-service.md)
- [PWA Frontend Module](../modules/pwa-frontend.md)

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**API Version:** v1.0.0
