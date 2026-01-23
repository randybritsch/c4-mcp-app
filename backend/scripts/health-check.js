const http = require('http');

const args = new Set(process.argv.slice(2));
const checkMcp = args.has('--mcp');

function getJson(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let json;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          json = { raw: data };
        }

        if (res.statusCode === 200) {
          resolve(json);
          return;
        }

        reject(new Error(`HTTP ${res.statusCode}: ${data || res.statusMessage}`));
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.end();
  });
}

(async () => {
  try {
    const healthData = await getJson('/api/v1/health');
    console.log('✓ Backend service is healthy');
    if (healthData && typeof healthData === 'object') {
      console.log(`  Uptime: ${Math.floor(healthData.uptime)}s`);
      console.log(
        `  Memory: ${Math.floor((healthData.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB`
      );
    }

    if (checkMcp) {
      const mcpData = await getJson('/api/v1/health/mcp');
      console.log('✓ MCP connectivity is healthy');
      if (mcpData && typeof mcpData === 'object') {
        console.log(`  MCP Base URL: ${mcpData.mcp?.baseUrl || 'unknown'}`);
        if (typeof mcpData.mcp?.toolCount === 'number') {
          console.log(`  Tool Count: ${mcpData.mcp.toolCount}`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
    process.exit(1);
  }
})();
