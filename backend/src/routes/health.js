const express = require('express');

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/v1/health
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
  });
});

module.exports = router;
