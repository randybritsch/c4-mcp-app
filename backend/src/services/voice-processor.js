const { transcribeAudio } = require('./stt');
const { parseIntent } = require('./llm');
const mcpClient = require('./mcp-client');
const { executePlannedCommand } = require('./command-orchestrator');
const logger = require('../utils/logger');
const { AppError, ErrorCodes } = require('../utils/errors');

/**
 * Process voice command through full pipeline: STT → LLM → MCP
 */
async function processVoiceCommand(audioData, format, correlationId, sessionId) {
  const startTime = Date.now();

  try {
    // Step 1: Speech-to-Text
    logger.info('Step 1: Starting STT', { correlationId });
    const sttResult = await transcribeAudio(audioData, format, correlationId);

    if (!sttResult.transcript || sttResult.transcript.trim().length === 0) {
      throw new AppError(
        ErrorCodes.STT_ERROR,
        'No speech detected in audio',
        400,
      );
    }

    // Step 2: Command Planning (LLM)
    logger.info('Step 2: Starting intent parsing', { correlationId });

    // Provide the LLM with the real MCP tool catalog (filtered to allowed tools)
    // so it can handle more natural language without a hard-coded tool list.
    const toolCatalog = await mcpClient.getAllowedToolCatalogForLlm(correlationId);
    const plan = await parseIntent(sttResult.transcript, correlationId, { toolCatalog });

    // Step 3: Execute tool call via c4-mcp (HTTP)
    logger.info('Step 3: Executing MCP command', { correlationId });
    const { command: mcpResult } = await executePlannedCommand(plan, {
      correlationId,
      sessionId,
      mcpClient,
    });

    const totalDuration = Date.now() - startTime;

    logger.info('Voice command processing complete', {
      correlationId,
      totalDuration,
      transcript: sttResult.transcript,
      plan,
    });

    return {
      transcript: sttResult.transcript,
      confidence: sttResult.confidence,
      plan,
      command: mcpResult,
      processingTime: totalDuration,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    logger.error('Voice command processing failed', {
      correlationId,
      totalDuration,
      error: error.message,
    });

    throw error;
  }
}

module.exports = {
  processVoiceCommand,
};
