const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * System prompt for intent parsing
 */
const SYSTEM_PROMPT = `You are a smart home intent parser for Control4 automation.
Parse natural language commands into structured JSON.

Available actions: turn_on, turn_off, set_temperature, lock, unlock, set_brightness, set_scene
Available targets: lights, thermostat, lock, camera, scene
Rooms: living_room, bedroom, kitchen, office, garage

Output ONLY valid JSON with this structure:
{
  "action": "action_name",
  "target": "target_name",
  "value": number_or_string (optional),
  "room": "room_name" (optional)
}

Examples:
"Turn on living room lights" -> {"action":"turn_on","target":"lights","room":"living_room"}
"Set thermostat to 72" -> {"action":"set_temperature","target":"thermostat","value":72}
"Lock the front door" -> {"action":"lock","target":"lock"}`;

/**
 * Parse intent using OpenAI
 */
async function parseWithOpenAI(transcript, correlationId) {
  const apiKey = config.llm.openai.apiKey;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'OpenAI API key not configured',
      500
    );
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.llm.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'LLM API error');
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse JSON response
    const intent = JSON.parse(content);

    return intent;
  } catch (error) {
    logger.error('OpenAI parsing error', { correlationId, error: error.message });
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      `Intent parsing failed: ${error.message}`,
      500
    );
  }
}

/**
 * Parse intent using Anthropic
 */
async function parseWithAnthropic(transcript, correlationId) {
  const apiKey = config.llm.anthropic.apiKey;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'Anthropic API key not configured',
      500
    );
  }

  // Anthropic implementation would go here
  throw new AppError(
    ErrorCodes.LLM_ERROR,
    'Anthropic LLM not yet implemented',
    501
  );
}

/**
 * Parse intent from transcript using configured LLM provider
 */
async function parseIntent(transcript, correlationId) {
  logger.info('Starting intent parsing', {
    correlationId,
    provider: config.llm.provider,
    transcript,
  });

  const startTime = Date.now();

  let intent;
  if (config.llm.provider === 'openai') {
    intent = await parseWithOpenAI(transcript, correlationId);
  } else if (config.llm.provider === 'anthropic') {
    intent = await parseWithAnthropic(transcript, correlationId);
  } else {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      `Unknown LLM provider: ${config.llm.provider}`,
      500
    );
  }

  const duration = Date.now() - startTime;

  logger.info('Intent parsing complete', {
    correlationId,
    duration,
    intent,
  });

  return intent;
}

module.exports = {
  parseIntent,
};
