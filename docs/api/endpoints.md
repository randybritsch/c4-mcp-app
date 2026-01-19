# API Endpoints Documentation

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

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
      │ POST /api/v1/auth/login        │
      │ { device_id: "..." }           │
      │───────────────────────────────>│
      │                                │
      │                     ┌──────────▼────────┐
      │                     │ Generate JWT      │
      │                     │ (30-day expiry)   │
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
    "device_id": "mobile-abc123",
    "iat": 1705660800,
    "exp": 1708252800
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
wss://home.yourdomain.com/api/v1/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 2. REST Endpoints {#rest-endpoints}

### Base URL

- **Production:** `https://home.yourdomain.com/api/v1`
- **Local Development:** `http://localhost:3001/api/v1`

---

### 2.1 POST `/api/v1/auth/login`

Authenticate a device and receive a JWT token.

**Auth Required:** No

**Request:**

```http
POST /api/v1/auth/login HTTP/1.1
Content-Type: application/json

{
  "device_id": "mobile-abc123"
}
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2VfaWQiOiJtb2JpbGUtYWJjMTIzIiwiaWF0IjoxNzA1NjYwODAwLCJleHAiOjE3MDgyNTI4MDB9.xyz",
  "expires_in": 2592000
}
```

**Error Responses:**

- `400 Bad Request`: Missing or invalid `device_id`
- `500 Internal Server Error`: Token generation failed

---

### 2.2 POST `/api/v1/voice`

Submit voice audio for processing.

**Auth Required:** Yes

**Request:**

```http
POST /api/v1/voice HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "audio": "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKE...",
  "format": "webm",
  "duration_ms": 3500,
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio` | string | Yes | Base64-encoded audio data (max 5MB) |
| `format` | string | Yes | Audio format (`webm`, `wav`, `mp3`) |
| `duration_ms` | number | Yes | Audio duration in milliseconds (max 10000) |
| `device_id` | string | Yes | Device UUID |
| `timestamp` | string | Yes | ISO 8601 timestamp |

**Response (200 OK):**

```json
{
  "request_id": "req-xyz789",
  "status": "processing",
  "message": "Voice command received and processing"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `request_id` | string | Unique request identifier for tracking |
| `status` | string | `processing`, `success`, or `error` |
| `message` | string | Human-readable status message |

**Status Updates (via WebSocket):**

After submitting, the client receives real-time updates via WebSocket:

```json
{"type": "transcript", "content": "Turn on the living room lights", "request_id": "req-xyz789"}
{"type": "intent", "content": "Action: turn_on, Device: living_room_lights", "request_id": "req-xyz789"}
{"type": "execution", "content": "Living room lights turned on", "status": "success", "request_id": "req-xyz789"}
```

**Error Responses:**

- `400 Bad Request`: Invalid audio format, missing fields, or audio too large
- `401 Unauthorized`: Invalid or expired token
- `413 Payload Too Large`: Audio exceeds 5MB
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing failed

---

### 2.3 POST `/api/v1/chat`

Submit a text message for processing.

**Auth Required:** Yes

**Request:**

```http
POST /api/v1/chat HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "message": "Turn on the living room lights",
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User's text command (max 500 chars) |
| `device_id` | string | Yes | Device UUID |
| `timestamp` | string | Yes | ISO 8601 timestamp |

**Response (200 OK):**

```json
{
  "request_id": "req-abc456",
  "status": "processing",
  "message": "Text command received and processing"
}
```

**Status Updates:** Same as voice endpoint (via WebSocket).

**Error Responses:**

- `400 Bad Request`: Empty message or exceeds 500 characters
- `401 Unauthorized`: Invalid or expired token
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Processing failed

---

### 2.4 GET `/api/v1/devices`

Retrieve list of available Control4 devices.

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

### 2.5 GET `/api/v1/status`

Get current state of all devices or a specific device.

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
  "status": "ok",
  "timestamp": "2026-01-19T10:30:00Z",
  "version": "1.0.0",
  "uptime_seconds": 123456
}
```

**Response (503 Service Unavailable):**

```json
{
  "status": "degraded",
  "message": "MCP server unreachable",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

---

## 3. WebSocket Protocol {#websocket}

### Connection

**Endpoint:** `wss://home.yourdomain.com/api/v1/ws`

**Authentication:**

Include JWT token as query parameter:

```
wss://home.yourdomain.com/api/v1/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Connection Flow:**

```javascript
const ws = new WebSocket('wss://home.yourdomain.com/api/v1/ws?token=' + token);

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

#### 3.1 Transcript Message

Sent after voice audio is transcribed.

```json
{
  "type": "transcript",
  "content": "Turn on the living room lights",
  "confidence": 0.96,
  "request_id": "req-xyz789",
  "timestamp": "2026-01-19T10:30:01Z"
}
```

#### 3.2 Intent Message

Sent after LLM parses the intent.

```json
{
  "type": "intent",
  "content": "Action: turn_on, Device: living_room_lights, Brightness: 100",
  "intent": {
    "action": "turn_on",
    "device": "living_room_lights",
    "parameters": {
      "brightness": 100
    }
  },
  "request_id": "req-xyz789",
  "timestamp": "2026-01-19T10:30:02Z"
}
```

#### 3.3 Execution Message

Sent after MCP command is executed.

```json
{
  "type": "execution",
  "content": "Living room lights turned on",
  "status": "success",
  "request_id": "req-xyz789",
  "timestamp": "2026-01-19T10:30:03Z"
}
```

#### 3.4 Error Message

Sent when an error occurs during processing.

```json
{
  "type": "error",
  "content": "Failed to parse intent: ambiguous command",
  "error_code": "INTENT_PARSE_ERROR",
  "request_id": "req-xyz789",
  "timestamp": "2026-01-19T10:30:02Z"
}
```

#### 3.5 Status Message

Sent for general status updates (e.g., device state changes).

```json
{
  "type": "status",
  "content": "Bedroom lights turned off by another user",
  "device_id": "device_67890",
  "timestamp": "2026-01-19T10:32:00Z"
}
```

---

### Message Types (Client → Server)

#### 3.6 Ping Message

Keep-alive message to maintain connection.

```json
{
  "type": "ping",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

**Response:**

```json
{
  "type": "pong",
  "timestamp": "2026-01-19T10:30:00Z"
}
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
| `/api/v1/voice` | 30 requests | Per minute per device |
| `/api/v1/chat` | 60 requests | Per minute per device |
| `/api/v1/devices` | 120 requests | Per minute per device |
| `/api/v1/status` | 120 requests | Per minute per device |
| `/api/v1/auth/login` | 10 requests | Per minute per IP |

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
