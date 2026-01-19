# Operational Runbook

**Project:** C4-MCP-App  
**Version:** 1.0.0  
**Last Updated:** January 19, 2026

> [← Back to Project Overview](../project_overview.md)

---

## Table of Contents

1. [Environments](#environments)
2. [Deployment Process](#deployment)
3. [Rollback Procedures](#rollback)
4. [Monitoring & Observability](#monitoring)
5. [Alerts & Notifications](#alerts)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance Tasks](#maintenance)
8. [On-Call Playbook](#oncall)

---

## 1. Environments {#environments}

### 1.1 Environment Overview

| Environment | Purpose | URL | Access |
|-------------|---------|-----|--------|
| **Development** | Local laptop dev | `http://localhost:3001` | Developers only |
| **Staging** | Pre-production testing | `https://staging.home.local` | Internal network |
| **Production** | Live system | `https://home.yourdomain.com` | Home users |

### 1.2 Environment Configuration

#### Development

- **Location:** Developer's laptop
- **Backend:** Node.js v18+ running locally (port 3001)
- **PWA:** Served via local web server (e.g., `python -m http.server`)
- **MCP Server:** Mock or test instance
- **Cloud APIs:** Dev/test API keys
- **Logs:** Console output
- **SSL:** Not required (HTTP OK for localhost)

#### Staging

- **Location:** Synology DS218+ (test partition or subdomain)
- **Backend:** Running on DS218+ (port 3001)
- **PWA:** Served via Web Station (subdomain `staging.home.local`)
- **MCP Server:** Test MCP server or production with read-only access
- **Cloud APIs:** Dev/test API keys
- **Logs:** `/var/log/c4-mcp-app-staging.log`
- **SSL:** Self-signed certificate or Let's Encrypt

#### Production

- **Location:** Synology DS218+ (primary)
- **Backend:** Node.js v22 running on DS218+ (port 3001)
- **PWA:** Served via Web Station (`home.yourdomain.com`)
- **MCP Server:** Production MCP server
- **Cloud APIs:** Production API keys
- **Logs:** `/var/log/c4-mcp-app.log`
- **SSL:** Let's Encrypt (auto-renewed)

### 1.3 Environment Variables

See [Backend Service Module - Configuration](../modules/backend-service.md#configuration) for full list.

**Key Differences by Environment:**

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NODE_ENV` | `development` | `staging` | `production` |
| `LOG_LEVEL` | `DEBUG` | `INFO` | `INFO` |
| `STT_API_KEY` | Test key | Test key | Prod key |
| `LLM_API_KEY` | Test key | Test key | Prod key |
| `MCP_SERVER_URL` | Mock server | Test server | Prod server |

---

## 2. Deployment Process {#deployment}

### 2.1 Pre-Deployment Checklist

- [ ] Code reviewed and merged to `main` branch
- [ ] All tests passing (unit, integration)
- [ ] Documentation updated
- [ ] Environment variables configured in `.env`
- [ ] Backup current production version
- [ ] Communicate deployment to users (if downtime expected)

### 2.2 Deployment Steps (Production)

#### Step 1: Backup Current Version

```bash
ssh admin@<NAS_IP>
cd /volume1/apps/c4-mcp-app
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz backend/ frontend/
mv backup-*.tar.gz /volume1/backups/c4-mcp-app/
```

#### Step 2: Upload New Code

From development machine:

```bash
# Backend
scp -r backend/ admin@<NAS_IP>:/volume1/apps/c4-mcp-app/backend-new/

# Frontend
scp -r frontend/ admin@<NAS_IP>:/volume1/web/c4-mcp-app/frontend-new/
```

#### Step 3: Install Dependencies

```bash
ssh admin@<NAS_IP>
cd /volume1/apps/c4-mcp-app/backend-new
npm install --production
```

#### Step 4: Run Pre-Deployment Tests

```bash
# Verify config
node -e "require('./src/config'); console.log('Config OK');"

# Test backend health
npm run test:health  # Custom script to check dependencies
```

#### Step 5: Stop Current Backend

```bash
# Find process ID
ps aux | grep "node src/server.js"

# Gracefully stop
kill -SIGTERM <PID>

# Wait 10 seconds for graceful shutdown
sleep 10

# Force kill if still running
kill -9 <PID>
```

#### Step 6: Swap Old and New Versions

```bash
cd /volume1/apps/c4-mcp-app
mv backend backend-old
mv backend-new backend

cd /volume1/web/c4-mcp-app
mv frontend frontend-old
mv frontend-new frontend
```

#### Step 7: Start New Backend

```bash
cd /volume1/apps/c4-mcp-app
./scripts/start-backend.sh
```

#### Step 8: Verify Deployment

```bash
# Check process is running
ps aux | grep "node src/server.js"

# Check health endpoint
curl http://localhost:3001/api/v1/health
# Expected: {"status":"ok",...}

# Check logs
tail -f /var/log/c4-mcp-app.log

# Test from PWA
# Open https://home.yourdomain.com in browser
# Submit test command "Turn on living room lights"
```

#### Step 9: Monitor for 15 Minutes

- Watch logs for errors
- Test voice and text commands
- Monitor memory usage: `ps aux | grep node`
- Check WebSocket connections: `netstat -an | grep 3001`

#### Step 10: Cleanup Old Versions (After 24 Hours)

```bash
ssh admin@<NAS_IP>
cd /volume1/apps/c4-mcp-app
rm -rf backend-old

cd /volume1/web/c4-mcp-app
rm -rf frontend-old
```

### 2.3 Automated Deployment Script

`scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

NAS_IP="192.168.1.100"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== C4-MCP-App Deployment Script ==="
echo "Timestamp: $TIMESTAMP"
echo "Target: $NAS_IP"

# Step 1: Backup
echo "[1/9] Creating backup..."
ssh admin@$NAS_IP "cd /volume1/apps/c4-mcp-app && tar -czf /volume1/backups/c4-mcp-app/backup-$TIMESTAMP.tar.gz backend/ frontend/"

# Step 2: Upload
echo "[2/9] Uploading new code..."
scp -r backend/ admin@$NAS_IP:/volume1/apps/c4-mcp-app/backend-new/
scp -r frontend/ admin@$NAS_IP:/volume1/web/c4-mcp-app/frontend-new/

# Step 3: Install dependencies
echo "[3/9] Installing dependencies..."
ssh admin@$NAS_IP "cd /volume1/apps/c4-mcp-app/backend-new && npm install --production"

# Step 4: Stop old backend
echo "[4/9] Stopping old backend..."
ssh admin@$NAS_IP "pkill -TERM -f 'node src/server.js' || true"
sleep 10

# Step 5: Swap versions
echo "[5/9] Swapping versions..."
ssh admin@$NAS_IP "cd /volume1/apps/c4-mcp-app && mv backend backend-old && mv backend-new backend"
ssh admin@$NAS_IP "cd /volume1/web/c4-mcp-app && mv frontend frontend-old && mv frontend-new frontend"

# Step 6: Start new backend
echo "[6/9] Starting new backend..."
ssh admin@$NAS_IP "/volume1/apps/c4-mcp-app/scripts/start-backend.sh"
sleep 5

# Step 7: Verify
echo "[7/9] Verifying deployment..."
HEALTH=$(curl -s http://$NAS_IP:3001/api/v1/health | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  echo "ERROR: Health check failed! Rolling back..."
  ssh admin@$NAS_IP "cd /volume1/apps/c4-mcp-app && pkill -9 -f 'node src/server.js' && mv backend backend-failed && mv backend-old backend && ./scripts/start-backend.sh"
  exit 1
fi

echo "[8/9] Deployment successful!"
echo "[9/9] Monitoring for 60 seconds..."
for i in {1..12}; do
  sleep 5
  HEALTH=$(curl -s http://$NAS_IP:3001/api/v1/health | jq -r '.status')
  echo "  Health check $i/12: $HEALTH"
done

echo "=== Deployment Complete ==="
echo "Monitor logs: ssh admin@$NAS_IP 'tail -f /var/log/c4-mcp-app.log'"
```

---

## 3. Rollback Procedures {#rollback}

### 3.1 When to Rollback

Rollback immediately if:

- Health check fails after deployment
- Critical errors in logs (e.g., backend crashes repeatedly)
- Commands fail >20% of the time
- Users report system unavailable
- Memory usage exceeds 512MB (DS218+ limit)

### 3.2 Rollback Steps

#### Quick Rollback (If `backend-old` Still Exists)

```bash
ssh admin@<NAS_IP>

# Stop current backend
pkill -9 -f 'node src/server.js'

# Swap back to old version
cd /volume1/apps/c4-mcp-app
mv backend backend-failed
mv backend-old backend

# Start old backend
./scripts/start-backend.sh

# Verify
curl http://localhost:3001/api/v1/health
```

**Time:** ~30 seconds

#### Full Rollback (From Backup)

```bash
ssh admin@<NAS_IP>

# Stop current backend
pkill -9 -f 'node src/server.js'

# Restore from latest backup
cd /volume1/apps/c4-mcp-app
LATEST_BACKUP=$(ls -t /volume1/backups/c4-mcp-app/backup-*.tar.gz | head -1)
tar -xzf $LATEST_BACKUP

# Start restored backend
./scripts/start-backend.sh

# Verify
curl http://localhost:3001/api/v1/health
```

**Time:** ~2 minutes

### 3.3 Post-Rollback Actions

1. **Investigate Root Cause:**
   - Check logs: `grep ERROR /var/log/c4-mcp-app.log`
   - Review recent code changes
   - Test in staging environment

2. **Document Incident:**
   - What failed?
   - When did it fail?
   - What was rolled back?
   - Root cause (if known)

3. **Communicate:**
   - Notify users of rollback
   - Provide ETA for fix (if known)

---

## 4. Monitoring & Observability {#monitoring}

### 4.1 Health Checks

#### Automated Health Check

`scripts/health-check.sh`:

```bash
#!/bin/bash
HEALTH_URL="http://localhost:3001/api/v1/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ "$RESPONSE" -eq 200 ]; then
  echo "OK: Backend healthy"
  exit 0
else
  echo "ERROR: Backend unhealthy (HTTP $RESPONSE)"
  exit 1
fi
```

**Cron Job (Every 5 Minutes):**

```bash
*/5 * * * * /volume1/apps/c4-mcp-app/scripts/health-check.sh || echo "Backend down!" | mail -s "C4-MCP-App Alert" admin@example.com
```

### 4.2 Log Monitoring

#### View Real-Time Logs

```bash
ssh admin@<NAS_IP>
tail -f /var/log/c4-mcp-app.log
```

#### Search for Errors

```bash
grep ERROR /var/log/c4-mcp-app.log | tail -20
```

#### Log Rotation

`/etc/logrotate.d/c4-mcp-app`:

```
/var/log/c4-mcp-app.log {
  daily
  rotate 30
  compress
  missingok
  notifempty
  create 0644 admin admin
}
```

### 4.3 Resource Monitoring

#### Memory Usage

```bash
ps aux | grep "node src/server.js" | awk '{print $6}'
# Output in KB (e.g., 102400 = 100MB)
```

#### CPU Usage

```bash
top -b -n 1 | grep "node"
```

#### Disk Usage

```bash
df -h /volume1/apps/c4-mcp-app
df -h /var/log
```

### 4.4 Metrics Dashboard (Optional)

For advanced monitoring, integrate with:

- **Prometheus + Grafana:** Export metrics from backend (custom exporter)
- **Synology Monitoring:** Use DSM's built-in Resource Monitor
- **Cloud Monitoring:** Send logs to cloud service (e.g., Datadog, CloudWatch)

**Basic Metrics to Track:**

- Request count (per endpoint)
- Error rate (%)
- P95 latency (ms)
- Memory usage (MB)
- WebSocket connections (count)
- MCP command success rate (%)

---

## 5. Alerts & Notifications {#alerts}

### 5.1 Alert Triggers

| Alert | Trigger | Severity | Action |
|-------|---------|----------|--------|
| **Backend Down** | Health check fails | Critical | Restart backend; investigate logs |
| **High Error Rate** | >10% errors in 5 min | High | Check logs; rollback if needed |
| **Memory High** | >400MB for >5 min | High | Restart backend; investigate memory leak |
| **Disk Full** | <10% free space | Medium | Clean old logs; expand storage |
| **MCP Unreachable** | MCP health check fails | Medium | Check MCP server status |
| **Cloud API Quota** | Rate limit exceeded | Low | Wait for quota reset; optimize usage |

### 5.2 Notification Channels

#### Email Alerts

`scripts/send-alert.sh`:

```bash
#!/bin/bash
SUBJECT="$1"
BODY="$2"
RECIPIENT="admin@example.com"

echo "$BODY" | mail -s "C4-MCP-App Alert: $SUBJECT" $RECIPIENT
```

#### SMS Alerts (via Twilio - Optional)

```bash
#!/bin/bash
TWILIO_SID="your_account_sid"
TWILIO_TOKEN="your_auth_token"
TWILIO_FROM="+1234567890"
TWILIO_TO="+0987654321"
MESSAGE="$1"

curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_SID/Messages.json" \
  --data-urlencode "From=$TWILIO_FROM" \
  --data-urlencode "To=$TWILIO_TO" \
  --data-urlencode "Body=$MESSAGE" \
  -u "$TWILIO_SID:$TWILIO_TOKEN"
```

### 5.3 Alert Escalation

- **Immediate (Critical):** SMS + Email + Push notification
- **High (5 min):** Email + Push notification
- **Medium (15 min):** Email only
- **Low (1 hour):** Log only (review later)

---

## 6. Troubleshooting {#troubleshooting}

### 6.1 Common Issues

#### Issue: Backend Won't Start

**Symptoms:**

- `./start-backend.sh` runs but no process appears
- Health check returns connection refused

**Diagnosis:**

```bash
# Check logs
tail -50 /var/log/c4-mcp-app.log

# Check port availability
netstat -tuln | grep 3001

# Check Node.js installation
which node
node --version
```

**Resolution:**

- If port in use: Kill zombie process or change port
- If Node.js missing: Install Node.js v22 via Package Center
- If wrong Node.js version: Verify with `node --version` (should be v22.x.x)
- If config error: Check `.env` file for missing/invalid values

---

#### Issue: Voice Commands Not Working

**Symptoms:**

- Text commands work, but voice commands fail
- PWA shows "Voice input temporarily unavailable"

**Diagnosis:**

```bash
# Check logs for STT errors
grep "STT" /var/log/c4-mcp-app.log | tail -20

# Test STT API manually
curl -X POST "https://speech.googleapis.com/v1/speech:recognize?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"config":{"encoding":"LINEAR16","sampleRateHertz":16000,"languageCode":"en-US"},"audio":{"content":"base64-audio"}}'
```

**Resolution:**

- If API key invalid: Update `STT_API_KEY` in `.env`
- If rate limit exceeded: Wait or upgrade API plan
- If network issue: Check internet connectivity

---

#### Issue: High Memory Usage

**Symptoms:**

- Backend using >400MB RAM
- DS218+ becomes sluggish
- Backend crashes with "Out of memory" error

**Diagnosis:**

```bash
# Check memory usage
ps aux | grep "node src/server.js"

# Generate heap snapshot (if Node.js supports)
kill -USR2 <PID>  # Triggers heap dump
```

**Resolution:**

- Restart backend immediately
- Investigate memory leak (check for unclosed connections, large buffers)
- Consider reducing `MAX_CONCURRENT_REQUESTS`
- If persistent, consider external hosting

---

#### Issue: WebSocket Disconnections

**Symptoms:**

- PWA shows "Reconnecting..." frequently
- No real-time updates

**Diagnosis:**

```bash
# Check WebSocket connections
netstat -an | grep 3001 | grep ESTABLISHED

# Check reverse proxy logs
cat /var/log/nginx/access.log | grep "ws"
```

**Resolution:**

- Check reverse proxy WebSocket support (ensure enabled)
- Verify firewall allows WebSocket traffic
- Increase WebSocket timeout in backend config

---

#### Issue: MCP Server Unreachable

**Symptoms:**

- Commands return "Cannot communicate with home system"
- Logs show `ECONNREFUSED` for MCP server

**Diagnosis:**

```bash
# Test MCP server directly
curl http://192.168.1.200:8080/health  # Adjust URL

# Check network connectivity
ping 192.168.1.200
```

**Resolution:**

- Verify `MCP_SERVER_URL` in `.env`
- Ensure MCP server is running
- Check firewall rules
- Test with mock MCP server if real server is unavailable

---

### 6.2 Debugging Tools

- **Logs:** Primary source of truth (`/var/log/c4-mcp-app.log`)
- **Health Endpoint:** Quick status check (`/api/v1/health`)
- **Process Monitor:** `ps aux | grep node`
- **Network Monitor:** `netstat -an | grep 3001`
- **Browser DevTools:** Inspect PWA errors, network requests, WebSocket messages

---

## 7. Maintenance Tasks {#maintenance}

### 7.1 Daily Tasks

- [ ] Check logs for errors: `grep ERROR /var/log/c4-mcp-app.log`
- [ ] Verify health check: `curl http://localhost:3001/api/v1/health`

### 7.2 Weekly Tasks

- [ ] Monitor resource usage (memory, CPU, disk)
- [ ] Review alert history
- [ ] Test backup restore process (randomly)

### 7.3 Monthly Tasks

- [ ] Rotate logs manually if logrotate not configured
- [ ] Update dependencies: `npm update` (after testing in staging)
- [ ] Review and update documentation
- [ ] Test disaster recovery procedures

### 7.4 Quarterly Tasks

- [ ] Full system audit (security, performance, reliability)
- [ ] Update SSL certificates (Let's Encrypt auto-renews, but verify)
- [ ] Review and update on-call playbook
- [ ] Conduct load testing

---

## 8. On-Call Playbook {#oncall}

### 8.1 Incident Response Process

1. **Acknowledge Alert:** Confirm receipt (email, SMS, push)
2. **Assess Severity:** Critical, High, Medium, or Low?
3. **Diagnose:** Check logs, health endpoint, resource usage
4. **Mitigate:** Restart backend, rollback, or failover
5. **Communicate:** Notify users if downtime expected
6. **Resolve:** Fix root cause
7. **Document:** Write postmortem (what, when, why, how fixed)

### 8.2 Critical Incident Playbook

**Scenario: Backend Completely Down**

1. Check if process is running: `ps aux | grep node`
2. If not running, start: `./start-backend.sh`
3. If won't start, check logs: `tail -50 /var/log/c4-mcp-app.log`
4. If config error, fix `.env` and restart
5. If still failing, rollback to last known good version
6. Notify users: "System temporarily unavailable, working on fix"
7. Investigate root cause after service restored

**Scenario: High Error Rate (>20%)**

1. Check logs for common error: `grep ERROR /var/log/c4-mcp-app.log | tail -50`
2. If cloud API issue, verify API keys and quotas
3. If MCP server issue, check MCP server status
4. If memory issue, restart backend: `pkill -TERM -f 'node' && ./start-backend.sh`
5. If errors persist, rollback to previous version
6. Monitor for 10 minutes after mitigation

**Scenario: Memory Leak**

1. Check memory usage: `ps aux | grep node`
2. If >400MB, restart immediately: `pkill -TERM -f 'node' && ./start-backend.sh`
3. Generate heap snapshot before restart (if possible)
4. After restart, monitor memory growth rate
5. If leak persists, investigate code for unclosed connections/buffers
6. Consider deploying hotfix or rolling back

### 8.3 Escalation Path

1. **On-Call Engineer:** Randy Britsch (primary)
2. **Backup:** [Backup contact if applicable]
3. **External Support:** Cloud API support, MCP vendor support

### 8.4 Contact Information

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Primary On-Call | Randy Britsch | [Phone] | [Email] |
| Backup | TBD | TBD | TBD |
| Synology Support | - | - | support.synology.com |
| Cloud API Support | - | - | [Vendor support] |

---

## Related Documents

- [← Project Overview](../project_overview.md)
- [Architecture Details](../architecture.md)
- [Backend Service Module](../modules/backend-service.md)
- [API Endpoints](../api/endpoints.md)

---

**Maintained By:** Randy Britsch  
**Last Updated:** January 19, 2026  
**Version:** 1.0.0
