# Deployment Verification Checklist

This checklist contains both the **current reference deployment** (Synology Container Manager / Compose) and **legacy** DSM-native steps (Web Station / Task Scheduler). Prefer Compose unless you have a specific reason not to.

## Reference Deployment (Recommended): Synology Container Manager (Compose)

- [ ] Backend reachable: `GET http://<NAS_IP>:3002/api/v1/health`
- [ ] Backend → c4-mcp reachable: `GET http://<NAS_IP>:3002/api/v1/health/mcp`
- [ ] c4-mcp reachable (host/LAN): `GET http://<NAS_IP>:3334/mcp/list`
- [ ] Backend env configured:
  - [ ] `OPENAI_API_KEY` set
  - [ ] `OPENAI_MODEL=gpt-4o-mini`
  - [ ] `STT_PROVIDER` + provider key(s) set
  - [ ] `C4_MCP_BASE_URL=http://c4-mcp:3333` (recommended inside Compose)
- [ ] c4-mcp write posture correct (if using write tools): `C4_WRITE_GUARDRAILS=true` and `C4_WRITES_ENABLED=true`

## Pre-Deployment Checklist

### 1. Icons Ready
- [ ] Open `frontend/icons/generate-icons.html` in browser
- [ ] Download all 8 icon sizes (72, 96, 128, 144, 152, 192, 384, 512px)
- [ ] Verify files exist: `frontend/icons/icon-72x72.png` through `icon-512x512.png`
- [ ] Confirm `frontend/manifest.json` paths match generated filenames

### 2. Environment Configuration
- [ ] Backend `.env` created from `.env.example`
- [ ] JWT_SECRET generated (64+ character random string)
- [ ] STT provider configured (Google or Azure with valid API key)
- [ ] LLM provider configured (OpenAI supported; Anthropic is not implemented)
- [ ] c4-mcp endpoint set in C4_MCP_BASE_URL (Compose: `http://c4-mcp:3333`, host/LAN: `http://<NAS_IP>:3334`)
- [ ] LOG_LEVEL set to `info` for production

### 3. Dependencies & Tests
- [ ] Backend: `npm install --production` completed successfully
- [ ] Frontend: No build step required (vanilla JS)
- [ ] Backend tests passing: `npm test` shows 6/6 tests passed
- [ ] No security vulnerabilities: `npm audit` shows no high/critical issues

---

## Backend Deployment

### On Synology DS218+

Legacy section (non-container deployment):

Run from your development machine (PowerShell):

```powershell
# 1. Deploy backend files
.\scripts\deploy-backend.sh
```

**Manual steps after script completes:**

- [ ] SSH into Synology: `ssh <username>@<synology-ip>`
- [ ] Edit production `.env`:
  ```bash
  cd /volume1/web/c4-mcp-app/backend
  nano .env
  # Paste your real API keys and credentials
  # Save: Ctrl+O, Enter, Ctrl+X
  ```
- [ ] Set file permissions:
  ```bash
  chmod 600 .env
  chown <your-username>:users .env
  ```
- [ ] Test manual start:
  ```bash
  cd /volume1/web/c4-mcp-app/backend
  node src/server.js
  ```
- [ ] Verify startup logs (no errors, listening on port 3000)
- [ ] Press `Ctrl+C` to stop

### Task Scheduler Configuration (Legacy)

- [ ] Open Synology DSM → Control Panel → Task Scheduler
- [ ] Create → Triggered Task → User-defined script
- [ ] General:
  - Task name: `C4 Voice Backend`
  - User: `<your-username>` (not root)
  - Event: Boot-up
- [ ] Task Settings → Run command:
  ```bash
  cd /volume1/web/c4-mcp-app/backend && /volume1/@appstore/Node.js_v22/usr/local/bin/node src/server.js >> /var/log/c4-mcp-app/backend.log 2>&1
  ```
- [ ] Email notifications: (Optional) Enable on abnormal termination
- [ ] Click OK
- [ ] Right-click task → Run → Verify it starts successfully
- [ ] Check logs:
  ```bash
  tail -f /var/log/c4-mcp-app/backend.log
  ```

---

## Frontend Deployment

### On Synology DS218+

Run from your development machine (PowerShell):

```powershell
# 2. Deploy frontend files
.\scripts\deploy-frontend.sh
```

**Manual steps after script completes:**

- [ ] If serving the frontend from a different host than the backend, use runtime overrides instead of editing source:
  - `?backend=http://<NAS_IP>:3002`
  - or `?api=http://<NAS_IP>:3002&ws=ws://<NAS_IP>:3002/ws`

### Web Station Configuration

- [ ] Open Synology DSM → Web Station
- [ ] Enable Web Station (if not already enabled)
- [ ] PHP Settings: Not required (pure HTML/JS app)
- [ ] Virtual Host → Create:
  - Hostname: `c4-voice.local` (or your preferred subdomain)
  - Port: HTTP 80, HTTPS 443
  - Document root: `/volume1/web/c4-voice`
  - HTTP back-end server: Not required
  - PHP: Not required
  - Enable personal website: No
- [ ] Click OK

### Reverse Proxy (API Routing)

- [ ] Open DSM → Control Panel → Login Portal → Advanced → Reverse Proxy
- [ ] Create → Reverse Proxy Rule:
  - Description: `C4 Voice API`
  - Source:
    - Protocol: HTTPS
    - Hostname: `c4-voice.local`
    - Port: 443
    - Enable HSTS: Yes (recommended)
  - Destination:
    - Protocol: HTTP
    - Hostname: localhost
    - Port: 3000
  - Click OK
- [ ] Create another rule for WebSocket:
  - Description: `C4 Voice WebSocket`
  - Source:
    - Protocol: HTTPS
    - Hostname: `c4-voice.local`
    - Port: 443
    - Enable WebSocket: **Yes** (critical!)
  - Destination:
    - Protocol: HTTP
    - Hostname: localhost
    - Port: 3000

### SSL Certificate (Let's Encrypt)

- [ ] Open DSM → Control Panel → Security → Certificate
- [ ] Add → Add a new certificate
- [ ] Get certificate from Let's Encrypt
- [ ] Domain name: `c4-voice.local` (or your domain)
- [ ] Email: your-email@example.com
- [ ] Subject Alternative Name: (leave empty or add aliases)
- [ ] Click Apply
- [ ] Wait for certificate generation (~1-2 minutes)
- [ ] Go to Configure → Assign certificate to services:
  - Assign to: `c4-voice.local` (your virtual host)
- [ ] Click OK

---

## Verification & Testing

### 1. Backend Health Check

From Synology SSH or development machine:

```bash
curl http://localhost:3000/api/v1/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-19T...",
  "uptime": 123.45,
  "memoryUsage": {...}
}
```

- [ ] Status is `"ok"`
- [ ] Uptime is increasing (backend is running)
- [ ] No errors in response

### 1b. MCP Connectivity Check

From Synology SSH or development machine:

```bash
curl http://localhost:3000/api/v1/health/mcp
```

- [ ] Status is `"healthy"`
- [ ] `mcp.baseUrl` matches your `C4_MCP_BASE_URL`

### 2. HTTPS Health Check

From any device on your network:

```bash
curl https://c4-voice.local/api/v1/health
```

- [ ] Returns same health response as above
- [ ] No SSL certificate errors
- [ ] Response time < 500ms

### 3. Frontend Accessibility

From a browser:

- [ ] Navigate to `https://c4-voice.local`
- [ ] Page loads without errors
- [ ] See "C4 Voice Control" interface
- [ ] Status indicator shows "Offline" or "Connecting..."
- [ ] No console errors in browser DevTools (F12)

### 4. WebSocket Connection

In browser (should happen automatically when page loads):

- [ ] Status indicator changes to "Online" (green dot)
- [ ] Browser console shows: `"WebSocket connected"`
- [ ] No WebSocket connection errors
- [ ] Connection remains stable for 30+ seconds

### 5. Authentication Test

In browser console (F12 → Console tab):

```javascript
fetch('https://c4-voice.local/api/v1/auth/token', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({deviceId: 'test-device-001'})
}).then(r => r.json()).then(console.log)
```

**Expected output:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

- [ ] Token returned successfully
- [ ] Token is a valid JWT (3 parts separated by dots)
- [ ] No authentication errors

### 6. Voice Recording Test

In browser:

- [ ] Click microphone button
- [ ] Browser prompts for microphone permission → Allow
- [ ] Button turns red/active
- [ ] Speak: "Turn on kitchen lights"
- [ ] Click button again to stop recording
- [ ] Observe transcript appearing (may take 2-5 seconds)

**Expected behavior:**
- [ ] Recording starts without errors
- [ ] Audio chunks sent via WebSocket
- [ ] Transcript displays: "turn on kitchen lights" (or similar)
- [ ] Intent parsed: `{action: "turn_on", target: "lights", room: "kitchen"}`
- [ ] Command log updates with timestamp

### 7. End-to-End Voice Command

**Prerequisites:** Control4 Director connected and accessible

- [ ] Record voice command: "Turn on living room lights"
- [ ] Verify transcript is correct
- [ ] Verify intent is parsed correctly
- [ ] Check command log for `command-complete` status
- [ ] **Physically verify:** Living room lights turn on
- [ ] Check backend logs for MCP communication:
  ```bash
  tail -f /var/log/c4-mcp-app/backend.log | grep MCP
  ```

### 8. Error Handling Test

Test with invalid voice input:

- [ ] Record silence (no speech) → Expect "No speech detected" error
- [ ] Record gibberish → Expect low-confidence transcript or intent parsing error
- [ ] Disconnect network → Expect "WebSocket disconnected" → Auto-reconnect when network returns

### 9. Offline PWA Test (Mobile)

From a mobile device on same network:

- [ ] Navigate to `https://c4-voice.local`
- [ ] Safari (iOS): Tap Share → Add to Home Screen
- [ ] Chrome (Android): Tap menu → Add to Home Screen
- [ ] Launch app from home screen → Loads in standalone mode
- [ ] Enable airplane mode → App still loads (from cache)
- [ ] Disable airplane mode → Reconnects and functional

### 10. Performance Test

- [ ] Backend memory usage < 256MB: `ps aux | grep node`
- [ ] Frontend bundle < 10MB: Check Network tab in DevTools
- [ ] Voice command response time < 5 seconds (STT + LLM + MCP)
- [ ] WebSocket reconnection < 5 seconds after network interruption
- [ ] Max 10 concurrent connections supported (test with 10 browser tabs)

---

## Post-Deployment Monitoring

### Automated Health Checks

Set up hourly health check task:

- [ ] Open DSM → Task Scheduler → Create → Scheduled Task → User-defined script
- [ ] General:
  - Task name: `C4 Voice Health Check`
  - User: `<your-username>`
  - Schedule: Every hour, or every 5 minutes
- [ ] Task Settings → Run command:
  ```bash
  /volume1/web/c4-mcp-app/backend/scripts/health-check.sh
  ```
- [ ] Enable email notifications on abnormal termination

### Log Monitoring

Check logs daily for first week:

```bash
# Backend application logs
tail -100 /var/log/c4-mcp-app/backend.log

# Error logs specifically
tail -100 /var/log/c4-mcp-app/error.log

# Check for common issues
grep -i "error\|timeout\|failed" /var/log/c4-mcp-app/backend.log | tail -20
```

### API Usage Monitoring

Monitor cloud provider dashboards:

- [ ] Google Cloud Console → APIs & Services → Dashboard → Check STT usage
- [ ] OpenAI Console → Usage → Check token consumption
- [ ] Set up billing alerts if usage exceeds expected amounts

---

## Rollback Procedure

If deployment fails or issues arise:

### 1. Stop Backend

```bash
# SSH into Synology
ssh <user>@<synology-ip>

# Find backend process
ps aux | grep "node src/server.js"

# Kill process
kill <PID>

# OR disable Task Scheduler task in DSM
```

### 2. Restore Previous Version

```bash
# If you kept backups
cd /volume1/web/c4-mcp-app
mv backend backend.broken
mv backend.backup backend

# Restart via Task Scheduler or manually
cd backend
node src/server.js
```

### 3. Disable Virtual Host

- [ ] DSM → Web Station → Virtual Host → Delete `c4-voice.local`
- [ ] This immediately stops frontend serving

---

## Success Criteria

**Deployment is successful when:**

- [x] Backend starts automatically on Synology boot
- [x] Health endpoint returns 200 OK
- [x] Frontend loads via HTTPS with valid SSL certificate
- [x] WebSocket connects and stays connected
- [x] Voice recording captures audio
- [x] STT transcribes speech correctly
- [x] LLM parses intent correctly
- [x] MCP sends commands to Control4 (verified with real device)
- [x] PWA installable on mobile devices
- [x] Offline mode works (cached UI)
- [x] Auto-reconnect works after network interruption
- [x] Logs are clean (no repeating errors)
- [x] Performance within targets (< 256MB RAM, < 5s response)

---

## Troubleshooting

### Backend won't start
- Check Node.js version: `/volume1/@appstore/Node.js_v22/usr/local/bin/node --version`
- Check .env permissions: `ls -la /volume1/web/c4-mcp-app/backend/.env`
- Check logs: `tail -f /var/log/c4-mcp-app/backend.log`

### Frontend 404 errors
- Verify files deployed: `ls /volume1/web/c4-voice/`
- Check Web Station virtual host configuration
- Verify document root path is correct

### WebSocket won't connect
- Verify reverse proxy has WebSocket enabled
- Check firewall rules (port 443 must be open)
- Test direct connection: `curl http://localhost:3000/ws` (should get upgrade error)

### SSL certificate errors
- Verify domain DNS is correct
- Check certificate is assigned to virtual host
- Renew certificate if expired (Let's Encrypt auto-renews)

### Voice commands not working
- Test each stage independently (see verification steps above)
- Check API keys are valid and have quota
- Verify Control4 Director is accessible from Synology
- Check correlation IDs in logs to trace request flow

---

**Deployment Date:** _____________

**Deployed By:** _____________

**Notes:**
