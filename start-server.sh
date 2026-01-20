#!/bin/bash
# C4 Voice Control Backend Auto-Start Script
# Place this in DSM Task Scheduler as a Boot-up task

# Wait for network to be ready
sleep 10

# Navigate to backend directory
cd /volume1/web/c4-mcp-app/backend || exit 1

# Start the Node.js server in background
/volume1/@appstore/Node.js_v22/usr/local/bin/node src/server.js >> /tmp/c4-mcp-app-logs/backend.log 2>&1 &

# Save the process ID
echo $! > /tmp/c4-mcp-app.pid

exit 0
