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

    const result = await processVoiceCommand(audioData, format, req.correlationId, req.user.deviceId);

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
    const { transcript, plan: planOverride } = req.body;

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

    let plan;
    if (planOverride !== undefined && planOverride !== null) {
      if (!planOverride || typeof planOverride !== 'object') {
        throw new AppError(
          ErrorCodes.USER_INPUT_ERROR,
          'plan must be an object like { tool: string, args: object }',
          400,
        );
      }
      const { tool } = planOverride;
      const { args } = planOverride;

      if (!tool || typeof tool !== 'string') {
        throw new AppError(
          ErrorCodes.USER_INPUT_ERROR,
          'plan.tool must be a string',
          400,
        );
      }
      if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
        throw new AppError(
          ErrorCodes.USER_INPUT_ERROR,
          'plan.args must be an object',
          400,
        );
      }

      plan = { tool: String(tool), args: args && typeof args === 'object' ? args : {} };
    } else {
      plan = await parseIntent(transcript, req.correlationId);
    }

    const command = await mcpClient.sendCommand(plan, req.correlationId, req.user.deviceId);

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
