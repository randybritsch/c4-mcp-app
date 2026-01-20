# C4 Voice Control - Task Scheduler Setup Guide

## Auto-Start Server on Boot

### Method 1: DSM Task Scheduler (Recommended)

1. **Open Task Scheduler**
   - Log in to DSM
   - Go to **Control Panel** > **Task Scheduler**

2. **Create Triggered Task**
   - Click **Create** > **Triggered Task** > **User-defined script**
   - Configure:
     - **Task**: C4 Voice Backend
     - **User**: randybritsch
     - **Event**: Boot-up
     - **Enabled**: ✓

3. **Task Settings**
   - **Run command**: Copy and paste this script:
   ```bash
   sleep 10
   cd /volume1/web/c4-mcp-app/backend
   /volume1/@appstore/Node.js_v22/usr/local/bin/node src/server.js >> /tmp/c4-mcp-app-logs/backend.log 2>&1 &
   echo $! > /tmp/c4-mcp-app.pid
   ```

4. **Save and Test**
   - Click **OK** to save
   - Right-click the task > **Run** to test
   - Wait 10 seconds, then check: `curl http://192.168.1.237:3001/api/v1/health`

### Method 2: Manual Script (Alternative)

Copy start-server.sh to NAS:
```bash
scp start-server.sh randybritsch@192.168.1.237:/volume1/web/c4-mcp-app/
ssh randybritsch@192.168.1.237 "chmod +x /volume1/web/c4-mcp-app/start-server.sh"
```

Then in Task Scheduler, use:
```bash
/volume1/web/c4-mcp-app/start-server.sh
```

## Verify Server is Running

```bash
# Check process
ssh randybritsch@192.168.1.237 "ps aux | grep 'node src/server.js'"

# Check health endpoint
curl http://192.168.1.237:3001/api/v1/health

# View logs
ssh randybritsch@192.168.1.237 "tail -f /tmp/c4-mcp-app-logs/backend.log"
```

## Stop Server

```bash
ssh randybritsch@192.168.1.237 "pkill -f 'node src/server.js'"
```

## Current Status

✅ Server running on port 3001
✅ Health endpoint responding: http://192.168.1.237:3001/api/v1/health
⏳ Auto-start not yet configured
⏳ API keys not yet added
⏳ Frontend not yet deployed

## Next Steps

1. Set up Task Scheduler (follow Method 1 above)
2. Obtain API keys (see API_KEYS.md)
3. Deploy frontend
4. Configure Control4 Director IP
