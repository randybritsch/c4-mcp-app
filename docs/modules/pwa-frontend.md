# PWA Frontend Module

**Module ID:** PWA-001  
**Version:** 1.0.0  
**Status:** Planning  
**Last Updated:** January 19, 2026

> [← Back to Module Index](README.md) | [← Project Overview](../project_overview.md)

---

## 1. Overview {#overview}

### Purpose

The PWA Frontend is a mobile-optimized Progressive Web App that provides the user interface for voice and text-based control of Control4 home automation devices. It runs entirely in the user's mobile browser and communicates with the backend service via HTTPS REST APIs and WebSocket connections.

### Key Characteristics

- **Technology:** HTML5, CSS3, Vanilla JavaScript (or lightweight framework like Alpine.js)
- **Platform:** iOS Safari 14+, Android Chrome 90+
- **Deployment:** Static files served via Synology Web Station
- **Offline Support:** Service Worker for basic offline functionality
- **Installation:** Can be added to home screen as PWA

### Dependencies

- **Upstream:** User interaction (voice, text, touch)
- **Downstream:** Backend Service API (`/api/v1/*` endpoints)
- **External:** Browser APIs (MediaRecorder, WebSocket, Service Worker)

---

## 2. Responsibilities {#responsibilities}

### Core Functionality

- Provide chat interface for text commands
- Capture voice input via push-to-talk button
- Display streaming responses from backend
- Show device status and command history
- Handle authentication (token storage, renewal)
- Maintain WebSocket connection for real-time updates
- Cache UI assets for offline access

### Boundaries (What It Does NOT Do)

- **No direct Control4 communication:** All commands go through backend
- **No local AI processing:** No speech-to-text or intent parsing locally
- **No business logic:** Only UI state management
- **No persistent storage of sensitive data:** Tokens in memory or secure storage only

### Upstream Dependencies

- User provides voice input or text commands
- Browser provides MediaRecorder API, WebSocket API, Service Worker API

### Downstream Dependencies

- Backend Service consumes HTTP requests and WebSocket messages
- Backend Service streams responses back via WebSocket

---

## 3. Interfaces {#interfaces}

### 3.1 Inputs

| Input | Format | Source | Frequency |
|-------|--------|--------|-----------|
| Voice Audio | Audio blob (WebM/WAV) | MediaRecorder API | On-demand (user initiated) |
| Text Command | String (UTF-8) | Text input field | On-demand (user initiated) |
| WebSocket Messages | JSON | Backend Service | Real-time (streaming) |
| User Gestures | Touch events | Touch screen | Continuous |

### 3.2 Outputs

| Output | Format | Destination | Purpose |
|--------|--------|-------------|---------|
| Voice Request | JSON + base64 audio | `POST /api/v1/voice` | Submit voice command |
| Chat Request | JSON | `POST /api/v1/chat` | Submit text command |
| Status Request | HTTP GET | `GET /api/v1/status` | Fetch device states |
| WebSocket Messages | JSON | Backend WebSocket | Send control messages |
| UI Updates | DOM manipulation | Browser | Display status, responses |

### 3.3 Public API (JavaScript Modules)

```javascript
// app.js - Main application controller
class App {
  init(): void
  authenticate(token: string): Promise<boolean>
  sendMessage(text: string): Promise<void>
  disconnect(): void
}

// audio.js - Voice input handler
class AudioRecorder {
  start(): Promise<void>
  stop(): Promise<Blob>
  isRecording(): boolean
  getFormat(): string
}

// websocket.js - WebSocket client
class WSClient {
  connect(url: string, token: string): Promise<void>
  send(message: object): void
  onMessage(callback: (msg: object) => void): void
  disconnect(): void
}

// api.js - REST API client
class APIClient {
  setAuthToken(token: string): void
  sendVoice(audioBlob: Blob): Promise<Response>
  sendChat(message: string): Promise<Response>
  getDevices(): Promise<Device[]>
  getStatus(): Promise<Status>
}
```

### 3.4 Events

**Emitted Events:**

- `voice-recording-start`: User pressed voice button
- `voice-recording-stop`: User released voice button
- `message-sent`: Text or voice command submitted
- `websocket-connected`: WebSocket connection established
- `websocket-disconnected`: WebSocket connection lost
- `auth-expired`: Authentication token expired

**Consumed Events:**

- `websocket-message`: Real-time update from backend
- `network-online`: Browser back online
- `network-offline`: Browser went offline

---

## 4. Data Models {#data-models}

### Voice Input Payload

```json
{
  "audio": "base64-encoded-audio-data",
  "format": "webm",
  "duration_ms": 3500,
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

### Chat Input Payload

```json
{
  "message": "Turn on the living room lights",
  "device_id": "mobile-abc123",
  "timestamp": "2026-01-19T10:30:00Z"
}
```

### WebSocket Message (Received)

```json
{
  "type": "status|transcript|intent|execution|error",
  "content": "Turning on living room lights...",
  "timestamp": "2026-01-19T10:30:01Z",
  "status": "success|pending|error"
}
```

### Validation Rules

- **audio:** Base64-encoded, max size 5MB
- **format:** Must be `webm`, `wav`, or `mp3`
- **duration_ms:** Max 10 seconds (10,000ms)
- **message:** Max length 500 characters
- **device_id:** UUID v4 format

---

## 5. Failure Modes {#failure-modes}

| Failure Mode | Cause | Impact | Recovery Strategy |
|--------------|-------|--------|-------------------|
| **Audio recording fails** | Browser denies microphone permission | User cannot use voice input | Show error message; guide user to enable permissions |
| **Audio codec not supported** | Browser doesn't support WebM | Voice input unavailable | Fallback to WAV format; show compatibility warning |
| **Network request fails (4xx)** | Invalid token or malformed request | Command not processed | Refresh auth token; re-send request; show error to user |
| **Network request fails (5xx)** | Backend service down | Command not processed | Show error; retry after 2s, 4s, 8s (exponential backoff) |
| **WebSocket disconnects** | Network interruption or timeout | No real-time updates | Auto-reconnect with exponential backoff; show "reconnecting" status |
| **Large audio payload** | User records >10 seconds | Request rejected by backend | Enforce 10s limit in UI; stop recording automatically |
| **Token expired** | Session timeout (>30 days) | All API calls fail with 401 | Redirect to login/re-auth flow; clear stored token |
| **Slow network** | High latency or low bandwidth | Poor UX, commands timeout | Show loading indicator; timeout after 30s; allow cancel |

### Degraded Operation Scenarios

1. **Offline Mode:**
   - Service Worker serves cached PWA shell
   - Display "Offline" banner
   - Queue commands to send when back online (optional)

2. **WebSocket Unavailable:**
   - Fall back to polling `/api/v1/status` every 5 seconds
   - Show warning: "Real-time updates unavailable"

3. **Voice Input Unavailable:**
   - Disable voice button
   - Show message: "Voice input not supported on this browser"
   - User can still use text commands

---

## 6. Testing {#testing}

### Test Strategy

- **Unit Tests:** JavaScript functions (API client, audio recorder) - 70% coverage goal
- **Integration Tests:** PWA ↔ Backend API interactions
- **E2E Tests:** Full user flows (voice command → status update)
- **Browser Tests:** Cross-browser compatibility (iOS Safari, Android Chrome)
- **Device Tests:** Test on real mobile devices (iPhone, Android phone)

### Key Test Cases

1. **Voice Recording:**
   - User grants microphone permission → recording starts
   - User denies permission → error message shown
   - Recording >10 seconds → auto-stop at 10s
   - Audio blob converts to base64 correctly

2. **Text Commands:**
   - User types message and presses Send → POST to `/api/v1/chat`
   - Response received → message displayed in chat history
   - Empty message → Send button disabled

3. **WebSocket:**
   - PWA connects to backend → `websocket-connected` event fires
   - Backend sends message → `onMessage` callback triggered
   - Connection drops → auto-reconnect after 2s, 4s, 8s
   - 3 failed reconnects → show persistent error

4. **Authentication:**
   - Valid token → API calls succeed
   - Expired token (401) → redirect to re-auth
   - Token stored securely (not in localStorage if sensitive)

5. **Offline Mode:**
   - Browser goes offline → Service Worker serves cached shell
   - User tries to send command → queued or error shown
   - Browser back online → reconnect WebSocket

### Mock/Stub Requirements

- **MockAPIClient:** Stub for testing without real backend
- **MockWebSocket:** Simulate WebSocket messages for testing
- **MockMediaRecorder:** Simulate audio recording for headless tests

### Test Data

- **Sample Voice Blob:** 3-second WebM audio file
- **Sample Chat Messages:** "Turn on lights", "Set temperature to 72"
- **Sample WebSocket Messages:** Various `status`, `transcript`, `execution` messages

---

## 7. Observability {#observability}

### Logging Strategy

Log to browser console (use `console.log`, `console.warn`, `console.error`).

**Log Levels:**

- **DEBUG:** Audio recording start/stop, WebSocket messages
- **INFO:** API requests, successful command submissions
- **WARN:** Reconnection attempts, degraded operation
- **ERROR:** Failed API calls, authentication errors

**Example Log:**

```javascript
console.info('[PWA] Sending voice command', {
  format: 'webm',
  size_bytes: 12345,
  duration_ms: 3500,
  timestamp: new Date().toISOString()
});
```

### Metrics to Track

| Metric | Description | Measurement |
|--------|-------------|-------------|
| **Audio Recording Success Rate** | % of recordings that succeed | Count successes / total attempts |
| **API Request Latency** | Time from send to response | `performance.now()` diff |
| **WebSocket Reconnects** | Number of reconnection attempts | Increment counter on reconnect |
| **Command Success Rate** | % of commands that execute successfully | Track `execution` status in WebSocket |
| **Page Load Time** | Time to interactive | `performance.timing` API |

### Telemetry Points

Send anonymized telemetry to backend (optional):

```json
{
  "event": "command_sent",
  "device_id": "mobile-abc123",
  "input_type": "voice|text",
  "latency_ms": 1523,
  "success": true
}
```

### Debugging Hooks

- **Debug Mode:** Enable via `?debug=true` query param
  - Shows verbose logs
  - Displays internal state (WebSocket status, token expiry)
- **Inspect Audio:** Button to download recorded audio blob for inspection
- **WebSocket Monitor:** UI panel showing raw WebSocket messages

---

## 8. Performance & KPIs {#performance}

### Performance Targets

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Initial Load Time** | < 2 seconds | Time to First Contentful Paint (FCP) |
| **Time to Interactive** | < 3 seconds | Lighthouse TTI metric |
| **Audio Recording Start** | < 500ms | Time from button press to recording |
| **API Request Latency** | < 2 seconds | Time from send to first response |
| **WebSocket Message Latency** | < 100ms | Time from server send to client receive (local network) |
| **Memory Usage** | < 100MB | Browser DevTools Memory Profiler |

### Resource Constraints

- **Bundle Size:** < 500KB (gzipped)
- **Image Assets:** < 200KB total
- **Service Worker Cache:** < 5MB

### Key Performance Indicators

1. **User Engagement:**
   - Number of commands per session
   - Voice vs. text command ratio

2. **Reliability:**
   - Command success rate (target: >95%)
   - WebSocket uptime (target: >99%)

3. **User Experience:**
   - Average latency (target: <2s)
   - Reconnection rate (lower is better)

### Optimization Notes

- **Lazy Load:** Load audio recording module only when user taps voice button
- **Compress Assets:** Use WebP for images, minify JS/CSS
- **Cache Aggressively:** Service Worker caches all static assets
- **Debounce:** Debounce text input (300ms) to avoid excessive API calls

---

## 9. Configuration {#configuration}

### Environment Variables

Not typically used in frontend (static files), but can be injected at build time:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `API_BASE_URL` | Backend API base URL | `/api/v1` | No |
| `WS_BASE_URL` | WebSocket base URL | `wss://home.yourdomain.com/api/v1/ws` | No |
| `DEBUG_MODE` | Enable debug logging | `false` | No |

### Configuration in Code

**config.js:**

```javascript
const config = {
  apiBaseUrl: window.location.origin + '/api/v1',
  wsBaseUrl: (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + 
              '//' + window.location.host + '/api/v1/ws',
  maxAudioDuration: 10000, // milliseconds
  reconnectAttempts: 3,
  reconnectBackoff: [2000, 4000, 8000], // milliseconds
  tokenStorageKey: 'c4_mcp_auth_token'
};
```

### PWA Manifest (`manifest.json`)

```json
{
  "name": "C4 Home Control",
  "short_name": "C4 MCP",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#007bff",
  "icons": [
    {
      "src": "/assets/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/assets/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 10. Operational Notes {#operations}

### Deployment Considerations

1. **Upload to Synology:**
   - Copy `frontend/` contents to `/volume1/web/c4-mcp-app/frontend/`
   - Set permissions: `chmod -R 755 /volume1/web/c4-mcp-app/frontend/`

2. **Web Station Setup:**
   - Enable Web Station in Synology DSM
   - Create virtual host with document root: `/volume1/web/c4-mcp-app/frontend`

3. **HTTPS:**
   - Configure Synology Reverse Proxy to serve PWA over HTTPS
   - Ensure Let's Encrypt certificate is active

### Common Issues and Troubleshooting

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| **PWA not loading** | Blank page, 404 errors | Check Web Station document root; verify file permissions |
| **Audio not recording** | Button click has no effect | Check browser console for permission errors; ensure HTTPS |
| **WebSocket won't connect** | No real-time updates | Check reverse proxy WebSocket support; verify backend is running |
| **HTTPS errors** | Certificate warnings | Renew Let's Encrypt certificate; check DNS settings |
| **Service Worker not updating** | Old version cached | Hard refresh (Ctrl+Shift+R); clear browser cache |

### Maintenance Tasks

- **Weekly:** Check browser console for errors on multiple devices
- **Monthly:** Update dependencies (if using build tools)
- **Quarterly:** Audit bundle size; optimize if >500KB

### Scaling Considerations

- **Concurrent Users:** PWA scales horizontally (each user loads their own copy)
- **Bandwidth:** Minimal (static files cached after first load)
- **No server-side scaling needed for PWA itself (only backend scales)**

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
- [Backend Service Module](backend-service.md)

---

**Maintained By:** Randy Britsch  
**Questions/Issues:** File issue in project repo
