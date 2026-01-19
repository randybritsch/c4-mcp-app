const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { processVoiceCommand } = require('../services/voice-processor');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Process voice command (synchronous)
 * POST /api/v1/voice/process
 * Body: { audioData: string (base64), format?: string }
 */
router.post('/process', authMiddleware, async (req, res, next) => {
  try {
    const { audioData, format = 'webm' } = req.body;

    if (!audioData) {
      throw new AppError(
        ErrorCodes.MISSING_PARAMETER,
        'audioData is required',
        400
      );
    }

    logger.info('Processing voice command', {
      correlationId: req.correlationId,
      deviceId: req.user.deviceId,
      format,
      audioSize: audioData.length,
    });

    const result = await processVoiceCommand(audioData, format, req.correlationId);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
