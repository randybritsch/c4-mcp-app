const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * System prompt for intent parsing
 */
const SYSTEM_PROMPT = `You are a smart home command planner.
Convert a user's natural language into a SINGLE Control4 tool call for the c4-mcp HTTP server.

Return ONLY valid JSON in this exact shape:
{
  "tool": "tool_name",
  "args": { ... }
}

Allowed tools (choose ONE):
- c4_room_lights_set
- c4_light_set_by_name
- c4_scene_activate_by_name
- c4_scene_set_state_by_name

Rules:
- Prefer c4_room_lights_set when the user mentions a room (e.g. "Basement").
- Use room_name/device_name/scene_name exactly as spoken (Title Case is fine). Do NOT invent IDs.
- For lights:
  - on/off: use args {"room_name":"<Room>","state":"on|off"}
  - brightness: use args {"room_name":"<Room>","level":0-100}
- For a specific light by name:
  - args {"device_name":"<Device>","state":"on|off"} or {"device_name":"<Device>","level":0-100}
- For scenes:
  - activate: {"scene_name":"<Scene>","room_name":"<Room>" (optional)}
  - state: {"scene_name":"<Scene>","state":"on|off","room_name":"<Room>" (optional)}

Examples:
"Turn on the basement lights" -> {"tool":"c4_room_lights_set","args":{"room_name":"Basement","state":"on"}}
"Set kitchen lights to 30%" -> {"tool":"c4_room_lights_set","args":{"room_name":"Kitchen","level":30}}
"Turn off the pendant lights" -> {"tool":"c4_light_set_by_name","args":{"device_name":"Pendant Lights","state":"off"}}
"Activate Movie Time" -> {"tool":"c4_scene_activate_by_name","args":{"scene_name":"Movie Time"}}`;

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
