const express = require('express');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Generate authentication token
 * POST /api/v1/auth/token
 * Body: { deviceId: string, deviceName?: string }
 */
router.post('/token', (req, res) => {
  const { deviceId, deviceName } = req.body;

  if (!deviceId) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PARAMETER',
        message: 'deviceId is required',
      },
    });
  }

  const token = generateToken({
    deviceId,
    deviceName: deviceName || 'Unknown Device',
    issuedAt: new Date().toISOString(),
  });

  logger.info('Token generated', {
    correlationId: req.correlationId,
    deviceId,
    deviceName,
  });

  res.json({
    token,
    expiresIn: '7 days',
  });
});

module.exports = router;
