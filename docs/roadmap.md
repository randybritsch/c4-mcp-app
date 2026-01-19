# Project Roadmap

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Project Overview](../project_overview.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Milestones](#milestones)
3. [Epic Breakdown](#epics)
4. [Risk Assessment](#risks)
5. [Mitigation Strategies](#mitigations)

---

## 1. Overview {#overview}

This roadmap outlines the planned development and deployment of the C4-MCP-App system over the next 8 weeks. The project is divided into three phases: MVP (0-2 weeks), Production-Ready (2-8 weeks), and Enhancements (8+ weeks).

### Timeline Summary

```
Week 0-2:  MVP (Minimum Viable Product)
Week 2-4:  Production Hardening
Week 4-6:  Advanced Features
Week 6-8:  Polish & Documentation
Week 8+:   Enhancements & Maintenance
```

### Success Criteria

- **MVP:** Voice and text commands work end-to-end on local network
- **Production:** Deployed to DS218+, accessible via HTTPS, 95% command success rate
- **Enhancements:** Multi-user support, advanced features (scheduled commands, dashboard)

---

## 2. Milestones {#milestones}

### Milestone 1: MVP Complete (Week 2)

**Date:** February 2, 2026  
**Status:** Not Started  
**Owner:** Randy Britsch

**Deliverables:**

- [ ] Basic PWA (voice + text input)
- [ ] Backend service (REST API + WebSocket)
- [ ] Cloud STT integration (proof-of-concept)
- [ ] Cloud LLM integration (proof-of-concept)
- [ ] MCP client (mock server for testing)
- [ ] Manual deployment to DS218+

**Acceptance Criteria:**

- User can submit voice command: "Turn on living room lights"
- System transcribes → parses intent → sends to mock MCP → returns success
- WebSocket streams status updates to PWA
- All core flows work on local network

**Dependencies:**

- Node.js installed on DS218+
- Cloud API keys (Google STT, OpenAI)
- Mock MCP server running

**Risks:**

- DS218+ resource constraints (mitigate: monitor memory/CPU)
- Cloud API integration complexity (mitigate: start with simple prompts)

---

### Milestone 2: Production Deployment (Week 4)

**Date:** February 16, 2026  
**Status:** Not Started  
**Owner:** Randy Britsch

**Deliverables:**

- [ ] Real MCP server integration (Control4 devices)
- [ ] HTTPS + Let's Encrypt SSL
- [ ] Synology Reverse Proxy configured
- [ ] Authentication (JWT tokens)
- [ ] Automated deployment script
- [ ] Health monitoring and alerts

**Acceptance Criteria:**

- System accessible via `https://home.yourdomain.com`
- Voice and text commands control real Control4 devices
- Authentication required for all endpoints
- Health check endpoint returns 200 OK
- Logs written to `/var/log/c4-mcp-app.log`

**Dependencies:**

- MCP server running and accessible
- Public domain name with DNS configured
- Let's Encrypt certificate issued

**Risks:**

- MCP server API compatibility (mitigate: early integration testing)
- Let's Encrypt setup complexity (mitigate: follow Synology docs)

---

### Milestone 3: Advanced Features (Week 6)

**Date:** March 2, 2026  
**Status:** Not Started  
**Owner:** Randy Britsch

**Deliverables:**

- [ ] Device discovery and status endpoints
- [ ] Confirmation flow for high-risk actions
- [ ] Action logging and history view
- [ ] PWA offline support (Service Worker)
- [ ] WebSocket reconnection logic
- [ ] Automated tests (unit + integration)

**Acceptance Criteria:**

- User can view list of all devices
- High-risk commands (lock, garage) require confirmation
- User can view command history (last 24 hours)
- PWA works offline (cached shell)
- WebSocket auto-reconnects on disconnect
- 70% test coverage for backend

**Dependencies:**

- MCP server supports device listing
- PWA Service Worker configured

**Risks:**

- Service Worker complexity (mitigate: use existing templates)
- History storage (mitigate: in-memory only for now)

---

### Milestone 4: Polish & Documentation (Week 8)

**Date:** March 16, 2026  
**Status:** Not Started  
**Owner:** Randy Britsch

**Deliverables:**

- [ ] Comprehensive documentation (operations, troubleshooting)
- [ ] User guide (setup, usage, FAQ)
- [ ] Performance optimization (latency, memory)
- [ ] End-to-end testing on real devices
- [ ] Disaster recovery procedures tested
- [ ] Monitoring dashboard (optional)

**Acceptance Criteria:**

- All documentation complete and accurate
- P95 latency <3s (voice), <2s (text)
- Memory usage <256MB
- Rollback tested and documented
- User guide covers common scenarios

**Dependencies:**

- System stable in production

**Risks:**

- Documentation drift (mitigate: update docs continuously)

---

## 3. Epic Breakdown {#epics}

### Epic 1: PWA Frontend (Weeks 0-2)

**Goal:** Build mobile-optimized PWA for voice and text commands.

**User Stories:**

1. As a user, I want to type a command and see it execute, so I can control devices via text.
2. As a user, I want to press a button to record voice, so I can control devices hands-free.
3. As a user, I want to see real-time status updates, so I know if my command succeeded.
4. As a user, I want the app to work on my phone, so I can control devices from anywhere in my home.

**Tasks:**

- [ ] Create HTML/CSS shell (mobile-first design)
- [ ] Implement text input and submit
- [ ] Implement push-to-talk voice recording (MediaRecorder API)
- [ ] Implement WebSocket client for streaming updates
- [ ] Create API client for REST endpoints
- [ ] Add PWA manifest and icons
- [ ] Test on iOS Safari and Android Chrome

**Estimate:** 1 week  
**Dependencies:** None

---

### Epic 2: Backend Service (Weeks 0-3)

**Goal:** Build Node.js backend that orchestrates STT, LLM, and MCP.

**User Stories:**

1. As a system, I need to transcribe audio to text, so I can understand voice commands.
2. As a system, I need to parse text into structured intents, so I can execute commands.
3. As a system, I need to translate intents to MCP commands, so I can control devices.
4. As a system, I need to stream status updates, so users get real-time feedback.

**Tasks:**

- [ ] Set up Express.js server
- [ ] Implement `/api/v1/voice` endpoint
- [ ] Implement `/api/v1/chat` endpoint
- [ ] Integrate Google Speech-to-Text API
- [ ] Integrate OpenAI GPT-4 API
- [ ] Build MCP client module
- [ ] Implement WebSocket server
- [ ] Add structured logging (Winston)
- [ ] Write unit tests (Jest)

**Estimate:** 2 weeks  
**Dependencies:** Cloud API access

---

### Epic 3: MCP Integration (Weeks 2-4)

**Goal:** Connect to real MCP server and control Control4 devices.

**User Stories:**

1. As a system, I need to send commands to Control4, so devices respond to user requests.
2. As a system, I need to fetch device states, so users can see current status.
3. As a system, I need to handle MCP errors, so failures are reported clearly.

**Tasks:**

- [ ] Document MCP server API (endpoints, auth, payloads)
- [ ] Implement MCP client (replace mock)
- [ ] Map user-friendly device names to Control4 IDs
- [ ] Implement device discovery endpoint
- [ ] Implement status query endpoint
- [ ] Add retry logic for MCP failures
- [ ] Test with real Control4 devices

**Estimate:** 1 week  
**Dependencies:** MCP server running, device list available

---

### Epic 4: Security & Auth (Weeks 3-4)

**Goal:** Secure the system with HTTPS and authentication.

**User Stories:**

1. As a user, I want my connection to be encrypted, so my commands are private.
2. As a user, I want to authenticate once, so I don't need to log in repeatedly.
3. As a system, I need to validate tokens, so only authorized users can issue commands.

**Tasks:**

- [ ] Set up Let's Encrypt on Synology
- [ ] Configure Synology Reverse Proxy (HTTPS, WebSocket)
- [ ] Implement JWT authentication
- [ ] Create `/api/v1/auth/login` endpoint
- [ ] Add auth middleware to protected endpoints
- [ ] Store tokens securely in PWA
- [ ] Test token expiry and renewal

**Estimate:** 1 week  
**Dependencies:** Public domain name, DNS configured

---

### Epic 5: Deployment & Operations (Weeks 4-5)

**Goal:** Deploy to production and set up monitoring.

**User Stories:**

1. As an operator, I want automated deployment, so updates are quick and reliable.
2. As an operator, I want health checks, so I know when the system is down.
3. As an operator, I want rollback procedures, so I can recover from bad deploys.

**Tasks:**

- [ ] Create deployment script (`deploy.sh`)
- [ ] Configure Task Scheduler for backend auto-start
- [ ] Set up health check endpoint
- [ ] Create health check cron job
- [ ] Set up email alerts for failures
- [ ] Write rollback script
- [ ] Test disaster recovery

**Estimate:** 1 week  
**Dependencies:** System stable in staging

---

### Epic 6: Advanced Features (Weeks 6-8)

**Goal:** Add polish and advanced features.

**User Stories:**

1. As a user, I want confirmation for dangerous actions, so I don't accidentally unlock doors.
2. As a user, I want to see command history, so I can review what I've done.
3. As a user, I want the app to work offline, so I can reload it without internet.

**Tasks:**

- [ ] Implement confirmation flow (locks, garage, alarm)
- [ ] Add action logging to backend
- [ ] Create history view in PWA
- [ ] Implement Service Worker for offline support
- [ ] Add WebSocket reconnection logic
- [ ] Optimize voice input for iOS (test on iPhone)
- [ ] Write end-to-end tests (Playwright)

**Estimate:** 2 weeks  
**Dependencies:** Core features complete

---

## 4. Risk Assessment {#risks}

### High-Risk Items

| Risk ID | Risk | Likelihood | Impact | Phase |
|---------|------|------------|--------|-------|
| **R1** | MCP server API undocumented or incompatible | High | Critical | Week 2-3 |
| **R2** | DS218+ insufficient resources (CPU/RAM) | Medium | High | Week 1-2 |
| **R3** | Cloud API costs exceed budget | Medium | Medium | Ongoing |
| **R4** | Let's Encrypt setup fails | Low | Medium | Week 3-4 |
| **R5** | Voice input doesn't work on iOS | Medium | High | Week 1-2 |

### Medium-Risk Items

| Risk ID | Risk | Likelihood | Impact | Phase |
|---------|------|------------|--------|-------|
| **R6** | WebSocket connections unstable | Medium | Medium | Week 2-4 |
| **R7** | LLM intent parsing unreliable | Medium | Medium | Week 1-2 |
| **R8** | Time estimate too optimistic | High | Low | All phases |

### Low-Risk Items

| Risk ID | Risk | Likelihood | Impact | Phase |
|---------|------|------------|--------|-------|
| **R9** | PWA not installable on older browsers | Low | Low | Week 1 |
| **R10** | Log file growth exhausts disk | Low | Low | Ongoing |

---

## 5. Mitigation Strategies {#mitigations}

### R1: MCP Server API Undocumented

**Mitigation:**

- **Early Testing:** Test MCP integration in Week 1 (before other features)
- **Mock Server:** Build mock MCP server to unblock development
- **Vendor Contact:** Reach out to MCP server vendor for API docs
- **Reverse Engineering:** Inspect MCP server network traffic if needed

**Contingency:**

- If MCP integration blocked, switch to direct Control4 API (if available)
- Or: Delay Control4 integration, deliver text-to-structured-command system only

---

### R2: DS218+ Insufficient Resources

**Mitigation:**

- **Early Monitoring:** Monitor memory/CPU from Day 1
- **Optimization:** Keep backend lean (no heavy libraries)
- **Resource Limits:** Set Node.js `--max-old-space-size=256`
- **Load Testing:** Test with 5 concurrent users before launch

**Contingency:**

- If resources insufficient, move backend to external cloud VM (AWS/Azure)
- Or: Reduce concurrent request limit to 3

---

### R3: Cloud API Costs Exceed Budget

**Mitigation:**

- **Cost Tracking:** Monitor API usage daily (Google Cloud Console, OpenAI dashboard)
- **Caching:** Cache common commands (e.g., "turn on lights")
- **Rate Limiting:** Limit to 60 requests/minute per device
- **Budget Alerts:** Set up billing alerts at $50, $100, $150

**Contingency:**

- If costs too high, switch to cheaper LLM (e.g., GPT-3.5 instead of GPT-4)
- Or: Reduce STT quality (use faster, cheaper tier)

---

### R4: Let's Encrypt Setup Fails

**Mitigation:**

- **Follow Docs:** Use Synology's official Let's Encrypt guide
- **Test DNS:** Verify domain resolves to home IP before requesting cert
- **Alternative CA:** Use ZeroSSL if Let's Encrypt fails

**Contingency:**

- If HTTPS fails, use self-signed certificate (local network only)
- Or: Use Synology QuickConnect (no custom domain needed)

---

### R5: Voice Input Doesn't Work on iOS

**Mitigation:**

- **Early Testing:** Test MediaRecorder API on iPhone Safari in Week 1
- **Polyfill:** Use recorder.js or similar polyfill if needed
- **Format:** Use WAV format if WebM not supported on iOS

**Contingency:**

- If voice input blocked on iOS, prioritize text input
- Or: Build native iOS app (significant effort, 4+ weeks)

---

### R7: LLM Intent Parsing Unreliable

**Mitigation:**

- **Prompt Engineering:** Craft detailed system prompts with examples
- **Validation:** Add validation layer to check LLM output format
- **Feedback Loop:** Log failed parses and improve prompts
- **Fallback:** Simple keyword matching for common commands

**Contingency:**

- If LLM too unreliable, use rule-based NLP (e.g., spaCy, compromise.js)
- Or: Require structured commands (e.g., "lights on bedroom")

---

## Related Documents

- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [Operational Runbook](../ops/runbook.md)
- [Module Specifications](../modules/README.md)

---

## Change History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-01-19 | Initial roadmap | Randy Britsch |

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**Next Review:** February 2, 2026 (after Milestone 1)
