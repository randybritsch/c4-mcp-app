const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/v1/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✓ Backend service is healthy');
      const healthData = JSON.parse(data);
      console.log(`  Uptime: ${Math.floor(healthData.uptime)}s`);
      console.log(`  Memory: ${Math.floor(healthData.memoryUsage.heapUsed / 1024 / 1024)}MB`);
      process.exit(0);
    } else {
      console.error(`✗ Health check failed with status ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('✗ Health check failed:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('✗ Health check timed out');
  req.destroy();
  process.exit(1);
});

req.end();
