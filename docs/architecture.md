# Architecture Documentation

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Project Overview](project_overview.md)

---

## Table of Contents

1. [Context Diagram](#context-diagram)
2. [Component Diagram](#component-diagram)
3. [Data Flow Diagram](#data-flow-diagram)
4. [Deployment Diagram](#deployment-diagram)
5. [Architecture Tradeoffs](#tradeoffs)

---

## 1. Context Diagram {#context-diagram}

### System Context

```
                  ┌─────────────────────┐
                  │   Mobile User       │
                  │   (iOS/Android)     │
                  └──────────┬──────────┘
                             │
                             │ HTTPS/WSS
                             │
        ┌────────────────────▼────────────────────┐
        │                                         │
        │        C4-MCP-App System                │
        │                                         │
        │  ┌─────────────┐  ┌─────────────────┐  │
        │  │     PWA     │  │  Backend Service│  │
        │  │  Frontend   │◄─┤   (Node.js)     │  │
        │  └─────────────┘  └────────┬────────┘  │
        │                             │           │
        └─────────────────────────────┼───────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
                 │                    │                    │
    ┌────────────▼──────────┐  ┌──────▼────────┐  ┌───────▼────────┐
    │  Cloud STT Service    │  │  Cloud LLM    │  │   MCP Server   │
    │  (Google/Azure)       │  │  (OpenAI/     │  │   (Control4    │
    │                       │  │   Anthropic)  │  │    Bridge)     │
    └───────────────────────┘  └───────────────┘  └───────┬────────┘
                                                           │
                                                           │
                                                  ┌────────▼────────┐
                                                  │  Control4       │
                                                  │  Home System    │
                                                  └─────────────────┘
```

### External Actors

- **Mobile User:** Homeowner or family member accessing system via smartphone/tablet
- **Cloud STT Service:** Third-party speech-to-text API (Google, Azure, AWS)
- **Cloud LLM Service:** Large Language Model API (OpenAI GPT-4, Anthropic Claude)
- **MCP Server:** Existing Model Context Protocol server that controls Control4
- **Control4 System:** Home automation hardware (lights, HVAC, locks, AV equipment)

### System Boundary

The C4-MCP-App system consists of:
- PWA Frontend (runs in user's browser)
- Backend Service (runs on Synology DS218+)
- All code, configuration, and deployment scripts within this repository

External dependencies are accessed via APIs but not controlled by this system.

---

## 2. Component Diagram {#component-diagram}

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile Browser                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    PWA Frontend                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │ UI Layer    │  │ Audio       │  │  WebSocket      │   │  │
│  │  │ (Chat,      │  │ Recorder    │  │  Client         │   │  │
│  │  │  Voice)     │  │ (MediaRec)  │  │                 │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │  │
│  │         │                │                   │            │  │
│  │         └────────────────┴───────────────────┘            │  │
│  │                          │                                │  │
│  │                   ┌──────▼──────┐                         │  │
│  │                   │  API Client │                         │  │
│  │                   └─────────────┘                         │  │
│  └────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTPS/WSS
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                   Synology DS218+ NAS                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Backend Service (Node.js)                   │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │              API Layer (Express/Fastify)             │ │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │ │  │
│  │  │  │ /api/voice   │  │ /api/chat    │  │ /api/ws    │ │ │  │
│  │  │  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │ │  │
│  │  └─────────┼─────────────────┼─────────────────┼────────┘ │  │
│  │            │                 │                 │          │  │
│  │  ┌─────────▼─────────────────▼─────────────────▼────────┐ │  │
│  │  │              Business Logic Layer                     │ │  │
│  │  │  ┌────────────┐  ┌──────────┐  ┌─────────────────┐  │ │  │
│  │  │  │ STT Service│  │LLM Service│  │  MCP Client     │  │ │  │
│  │  │  └─────┬──────┘  └─────┬────┘  └────────┬────────┘  │ │  │
│  │  │        │               │                 │           │ │  │
│  │  └────────┼───────────────┼─────────────────┼───────────┘ │  │
│  │           │               │                 │             │  │
│  │  ┌────────▼───────────────▼─────────────────▼───────────┐ │  │
│  │  │           Infrastructure Layer                        │ │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │ │  │
│  │  │  │ Logger  │  │  Auth   │  │  Config │  │ Error   │ │ │  │
│  │  │  │         │  │  Mgr    │  │  Mgr    │  │ Handler │ │ │  │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘ │ │  │
│  │  └───────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┼───────────┐
                │           │           │
      ┌─────────▼──┐  ┌─────▼────┐  ┌──▼─────────┐
      │ Cloud STT  │  │Cloud LLM │  │ MCP Server │
      └────────────┘  └──────────┘  └────────────┘
```

### Component Responsibilities

| Component | Responsibility | Technology |
|-----------|----------------|------------|
| **UI Layer** | User interface rendering, event handling | HTML5, CSS3, Vanilla JS |
| **Audio Recorder** | Capture voice input via MediaRecorder API | Web Audio API, MediaRecorder |
| **WebSocket Client** | Maintain persistent connection for streaming | WebSocket API |
| **API Client** | HTTP requests to backend (voice, chat, status) | Fetch API |
| **API Layer** | REST endpoints, request routing, validation | Express.js or Fastify |
| **STT Service** | Convert audio to text via cloud API | Google Speech-to-Text SDK |
| **LLM Service** | Parse intent from text via cloud LLM | OpenAI SDK or Anthropic SDK |
| **MCP Client** | Translate intent to MCP commands | MCP SDK |
| **Auth Manager** | Validate tokens, manage sessions | JWT library |
| **Logger** | Structured logging to file/console | Winston or Pino |
| **Config Manager** | Load environment variables, settings | dotenv |
| **Error Handler** | Centralized error handling and formatting | Custom middleware |

---

## 3. Data Flow Diagram {#data-flow-diagram}

### Voice Command Flow (Detailed)

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. Press and hold voice button
     ▼
┌─────────────────┐
│ PWA: UI Layer   │
└────┬────────────┘
     │ 2. Start audio recording (MediaRecorder)
     ▼
┌─────────────────┐
│ PWA: Audio Rec  │
└────┬────────────┘
     │ 3. User releases button → stop recording
     │    Collect audio blob (WebM/WAV)
     ▼
┌─────────────────┐
│ PWA: API Client │
└────┬────────────┘
     │ 4. POST /api/v1/voice
     │    { audio: base64, format: "webm", device_id: "..." }
     ▼
┌─────────────────────────────┐
│ Backend: API Layer          │
│ (Express route handler)     │
└────┬────────────────────────┘
     │ 5. Validate auth token
     │ 6. Extract audio payload
     ▼
┌─────────────────────────────┐
│ Backend: STT Service        │
└────┬────────────────────────┘
     │ 7. Send audio to Cloud STT API
     │    (Google Speech-to-Text)
     ▼
┌─────────────────────────────┐
│ Cloud STT API               │
└────┬────────────────────────┘
     │ 8. Return transcript
     │    { text: "Turn on living room lights" }
     ▼
┌─────────────────────────────┐
│ Backend: LLM Service        │
└────┬────────────────────────┘
     │ 9. Send to Cloud LLM with system prompt:
     │    "Parse this Control4 command: [text]"
     ▼
┌─────────────────────────────┐
│ Cloud LLM API               │
└────┬────────────────────────┘
     │ 10. Return structured intent
     │     { action: "turn_on", device: "living_room_lights",
     │       parameters: { brightness: 100 } }
     ▼
┌─────────────────────────────┐
│ Backend: MCP Client         │
└────┬────────────────────────┘
     │ 11. Translate to MCP command
     │     { type: "command", target: "device_12345",
     │       action: "set_state", params: {...} }
     ▼
┌─────────────────────────────┐
│ MCP Server                  │
└────┬────────────────────────┘
     │ 12. Execute on Control4 hardware
     ▼
┌─────────────────────────────┐
│ Control4 System             │
└────┬────────────────────────┘
     │ 13. Return success/failure
     ▼
┌─────────────────────────────┐
│ Backend: MCP Client         │
└────┬────────────────────────┘
     │ 14. Stream status updates via WebSocket
     │     { type: "transcript", content: "Turn on..." }
     │     { type: "intent", content: "Parsed: turn_on..." }
     │     { type: "execution", content: "Lights turned on" }
     ▼
┌─────────────────────────────┐
│ PWA: WebSocket Client       │
└────┬────────────────────────┘
     │ 15. Update UI with streaming responses
     ▼
┌─────────────────────────────┐
│ PWA: UI Layer               │
│ (Display: "✓ Lights on")    │
└─────────────────────────────┘
```

### Text Command Flow

Text commands follow the same flow but skip steps 2-3 (audio recording) and step 7-8 (STT). The user types directly into the chat interface, and the text is sent immediately to the LLM service (step 9).

---

## 4. Deployment Diagram {#deployment-diagram}

### Physical/Runtime Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet                                │
└─────────────────┬─────────────────────────┬─────────────────────┘
                  │                         │
                  │                         │
        ┌─────────▼────────┐      ┌─────────▼────────┐
        │  Cloud STT       │      │  Cloud LLM       │
        │  (Google/Azure)  │      │  (OpenAI)        │
        └──────────────────┘      └──────────────────┘
                  │
                  │ HTTPS (port 443)
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                  Home Network (192.168.1.x)                     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           Synology DS218+ (192.168.1.100)                  │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         Synology DSM Operating System               │ │ │
│  │  │                                                      │ │ │
│  │  │  ┌────────────────────────────────────────────────┐ │ │ │
│  │  │  │  Reverse Proxy (nginx-based)                   │ │ │ │
│  │  │  │  - Port 443 (HTTPS)                            │ │ │ │
│  │  │  │  - Let's Encrypt SSL Cert                      │ │ │ │
│  │  │  │  - Route: / → Web Station                      │ │ │ │
│  │  │  │  - Route: /api/* → Backend :3001               │ │ │ │
│  │  │  └───────────┬────────────────────┬───────────────┘ │ │ │
│  │  │              │                    │                 │ │ │
│  │  │  ┌───────────▼───────┐  ┌─────────▼──────────────┐ │ │ │
│  │  │  │  Web Station      │  │  Backend Service       │ │ │ │
│  │  │  │  (Port 80)        │  │  (Node.js on :3001)    │ │ │ │
│  │  │  │  ┌─────────────┐  │  │  ┌──────────────────┐  │ │ │ │
│  │  │  │  │ PWA Frontend│  │  │  │  server.js       │  │ │ │ │
│  │  │  │  │ (Static     │  │  │  │  - Express       │  │ │ │ │
│  │  │  │  │  Files)     │  │  │  │  - WebSocket     │  │ │ │ │
│  │  │  │  └─────────────┘  │  │  │  - MCP Client    │  │ │ │ │
│  │  │  └───────────────────┘  │  └──────────────────┘  │ │ │ │
│  │  │                         │                         │ │ │ │
│  │  │                         │  ┌──────────────────┐  │ │ │ │
│  │  │                         │  │ Task Scheduler   │  │ │ │ │
│  │  │                         │  │ (Starts backend  │  │ │ │ │
│  │  │                         │  │  on boot)        │  │ │ │ │
│  │  │                         │  └──────────────────┘  │ │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │ │
│  │                                                        │ │ │
│  │  File System:                                          │ │ │
│  │  /volume1/web/c4-mcp-app/frontend/  (PWA files)       │ │ │
│  │  /volume1/apps/c4-mcp-app/backend/  (Backend code)    │ │ │
│  │  /var/log/c4-mcp-app.log            (Logs)            │ │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           MCP Server (Separate Device/Process)         │ │
│  │           (IP: 192.168.1.200 or localhost)             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                  │
                  │ WiFi/4G/5G
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│              User's Mobile Device                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Mobile Browser (Safari/Chrome)                  │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │               PWA Application                      │  │   │
│  │  │  (Loaded from https://home.yourdomain.com)         │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Deployment Notes

- **Synology DS218+ Specs:** Realtek RTD1296 (dual-core 1.4 GHz), 2GB RAM, no GPU
- **Network:** Home LAN (192.168.1.x); internet access for cloud APIs
- **SSL/TLS:** Let's Encrypt certificate via Synology DSM (auto-renewal)
- **DNS:** Public domain (e.g., `home.yourdomain.com`) pointing to home IP or Synology QuickConnect
- **Ports:**
  - External: 443 (HTTPS) → forwarded to Synology
  - Internal: 80 (Web Station), 3001 (Backend), MCP Server port (TBD)
- **Process Management:** Synology Task Scheduler (boot-up script)
- **Persistence:** Backend runs as long-lived process; auto-restart on crash via watchdog script (optional)

---

## 5. Architecture Tradeoffs {#tradeoffs}

### 5.1 No Docker/Containers

**Decision:** Use native Synology DSM tools instead of Docker.

| Pros | Cons |
|------|------|
| Lower resource overhead (critical for DS218+) | No containerized isolation |
| Simpler deployment (no Docker daemon) | Manual dependency management |
| More stable on low-power hardware | Harder to replicate dev environment |
| Native Synology integration | Less portable to other platforms |

**Mitigation:** Use `package.json`/`requirements.txt` for reproducible dependencies; document exact Node.js/Python versions.

---

### 5.2 Cloud-Based AI (STT + LLM)

**Decision:** Offload AI inference to cloud APIs rather than local processing.

| Pros | Cons |
|------|------|
| No local GPU/CPU requirements | Requires internet connection |
| Access to best-in-class models | Ongoing API costs (~$0.01-0.10/command) |
| Lower latency than DS218+ could achieve | Privacy: voice data sent to cloud |
| No model training/tuning needed | Vendor lock-in (OpenAI, Google, etc.) |

**Mitigation:** Cache common commands; implement fallback for network failures; document privacy implications for users.

---

### 5.3 PWA vs. Native Mobile App

**Decision:** Build Progressive Web App instead of native iOS/Android apps.

| Pros | Cons |
|------|------|
| Single codebase (web standards) | Limited OS integration (no background processing) |
| No app store approval process | Cannot use native STT (must use cloud or browser APIs) |
| Easy updates (just deploy to NAS) | Requires HTTPS (Let's Encrypt setup) |
| Works on any device with browser | Less "native" feel |

**Mitigation:** Use Service Workers for offline support; optimize UX for mobile browsers; leverage Web Audio API for voice input.

---

### 5.4 WebSocket for Streaming vs. Polling

**Decision:** Use WebSocket for real-time command status updates.

| Pros | Cons |
|------|------|
| Low latency (<100ms for local network) | Requires WebSocket-capable reverse proxy |
| Efficient (persistent connection) | More complex to implement than polling |
| Better UX (immediate feedback) | Connection drops require reconnection logic |

**Mitigation:** Implement reconnection with exponential backoff; fallback to polling if WebSocket fails.

---

### 5.5 Node.js vs. Python for Backend

**Decision:** Tentatively Node.js (pending MCP SDK compatibility check).

| Node.js Pros | Python Pros |
|--------------|-------------|
| Lower memory footprint (~50MB vs ~100MB) | More mature ecosystem for AI/ML |
| Faster startup time | Easier integration if MCP SDK is Python-based |
| Better async I/O for WebSocket | Simpler syntax for rapid prototyping |
| Native JSON handling | Better library support for data processing |

**Decision Criteria:** 
1. Check MCP server SDK language support
2. Measure actual memory usage on DS218+
3. Evaluate developer familiarity

**Mitigation:** Modular design allows switching languages later if needed; keep business logic separate from framework code.

---

### 5.6 Single Backend Process vs. Microservices

**Decision:** Monolithic backend service (single Node.js/Python process).

| Pros | Cons |
|------|------|
| Simpler deployment and debugging | No independent scaling of components |
| Lower resource usage (1 process vs. many) | Harder to isolate failures |
| Easier to manage on DS218+ | Code coupling risk |
| Faster inter-component communication | Less flexible for future growth |

**Mitigation:** Modular code structure with clear separation of concerns; design for future refactoring to microservices if needed.

---

### 5.7 Home-Grade Security vs. Enterprise Auth

**Decision:** Simple token-based auth, no OAuth/SAML/SSO.

| Pros | Cons |
|------|------|
| Easier to implement and maintain | Not suitable for multi-tenant scenarios |
| Lower latency (no external auth calls) | Simpler auth = potential vulnerabilities |
| Sufficient for private home use | No fine-grained permissions |
| No dependency on external auth providers | Manual user management |

**Mitigation:** Use HTTPS for all traffic; implement action logging; require confirmation for high-risk commands; consider device-based auth (easier than passwords).

---

## Related Documents

- [← Project Overview](project_overview.md)
- [Module Specifications](modules/README.md)
- [API Endpoints](api/endpoints.md)
- [Operational Runbook](ops/runbook.md)
- [Data Contracts](data/contracts.md)

---

**Last Updated:** January 19, 2026  
**Maintained By:** Randy Britsch
