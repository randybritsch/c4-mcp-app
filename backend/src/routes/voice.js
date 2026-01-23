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
        400,
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

/**
 * Process a text command (no STT)
 * POST /api/v1/voice/process-text
 * Body: { transcript: string }
 */
router.post('/process-text', authMiddleware, async (req, res, next) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      throw new AppError(
        ErrorCodes.MISSING_PARAMETER,
        'transcript is required',
        400,
      );
    }

    logger.info('Processing text command', {
      correlationId: req.correlationId,
      deviceId: req.user.deviceId,
      transcript,
    });

    // Reuse the same pipeline but skip STT.
    const { parseIntent } = require('../services/llm');
    const mcpClient = require('../services/mcp-client');

    const plan = await parseIntent(transcript, req.correlationId);
    const command = await mcpClient.sendCommand(plan, req.correlationId);

    res.json({
      transcript,
      plan,
      command,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
