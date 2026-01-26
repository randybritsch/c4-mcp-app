const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs) || 0);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSystemPrompt() {
  const configuredScenes = Array.isArray(config?.scenes?.names) ? config.scenes.names : [];
  const scenesBlock = configuredScenes.length
    ? `\n\nKnown scene names (prefer these exactly when recommending a scene):\n${configuredScenes
      .slice(0, 40)
      .map((s) => `- ${s}`)
      .join('\n')}`
    : '';

  return `You are a smart home command planner.
Convert a user's natural language into a SINGLE Control4 tool call for the c4-mcp HTTP server.

Return ONLY valid JSON in this exact shape:
{
  "tool": "tool_name",
  "args": { ... }
}

Allowed tools (choose ONE):
- c4_room_lights_set
- c4_light_set_by_name
- c4_lights_set_last
- c4_tv_watch_by_name
- c4_tv_off
- c4_tv_off_last
- c4_tv_remote_last
- c4_scene_activate_by_name
- c4_scene_set_state_by_name
- c4_list_rooms

New capability: Mood / vibe requests
- If the user expresses a mood or vibe (e.g. "I'm in a romantic mood", "make it cozy", "party mode", "set the mood"),
  recommend an appropriate scene by returning tool c4_scene_activate_by_name.
- If known scene names are provided, choose the best matching one from that list.
- If no scene list is provided, choose a reasonable scene_name that reflects the mood
  (examples: Romantic, Cozy, Relax, Party, Movie Time, Night).

Rules:
- Prefer c4_room_lights_set when the user mentions a room (e.g. "Basement").
- Use room_name/device_name/scene_name exactly as spoken (Title Case is fine). Do NOT invent IDs.
- If the user uses pronouns or follow-ups that refer to the previous light(s)
  (e.g. "turn it back on", "turn them back off", "undo that", "those lights", "back on", "again"),
  use c4_lights_set_last with args {"state":"on|off"} or {"level":0-100}.
- If the user refers to the TV/media as a follow-up without specifying a room
  (e.g. "turn off the TV", "turn it off", "shut it down"), use c4_tv_off_last with args {}.
- If the user refers to TV/media volume as a follow-up without specifying a room
- If the user refers to TV/media remote actions as a follow-up without specifying a room/device
  (e.g. "pause", "play", "mute", "turn down the volume", "up", "select", "back", "menu"),
  use c4_tv_remote_last and choose ONE of these button values:
  up, down, left, right, select, ok, enter, back, menu, info, exit, guide,
  play, pause, ff, rew, recall, prev, page_up, page_down,
  volume_up, volume_down, volup, voldown, mute,
  channel_up, channel_down, ch_up, ch_down,
  power_off, off, room_off.
  Notes:
  - "turn down the volume" -> {"button":"volume_down"}
  - "turn up the volume" -> {"button":"volume_up"}
  - "mute" -> {"button":"mute"}
  - "pause" -> {"button":"pause"}
  - "play" -> {"button":"play"}
  This tool MUST reuse the last TV/media context from this session
  (e.g., if the last action was Apple TV in Family Room).
- To turn on a TV/media source by name, prefer c4_tv_watch_by_name with args
  {"room_name":"<Room>","source_device_name":"<Source>"}.
  IMPORTANT: If the user says "basement Roku" or "basement TV", always use room_name="TV Room"
  because that is the actual room with the Roku in the basement area.
- For lights:
  - on/off: use args {"room_name":"<Room>","state":"on|off"}
  - brightness: use args {"room_name":"<Room>","level":0-100}
- For a specific light by name:
  - args {"device_name":"<Device>","state":"on|off"} or {"device_name":"<Device>","level":0-100}
- For scenes:
  - activate: {"scene_name":"<Scene>","room_name":"<Room>" (optional)}
  - state: {"scene_name":"<Scene>","state":"on|off","room_name":"<Room>" (optional)}

Examples:
"List rooms" -> {"tool":"c4_list_rooms","args":{}}
"Turn on the basement lights" -> {"tool":"c4_room_lights_set","args":{"room_name":"Basement","state":"on"}}
"Set kitchen lights to 30%" -> {"tool":"c4_room_lights_set","args":{"room_name":"Kitchen","level":30}}
"Turn off the pendant lights" -> {"tool":"c4_light_set_by_name","args":{"device_name":"Pendant Lights","state":"off"}}
"Turn it back on" -> {"tool":"c4_lights_set_last","args":{"state":"on"}}
"Turn on Family Room Apple TV" ->
  {"tool":"c4_tv_watch_by_name","args":{"room_name":"Family Room","source_device_name":"Apple TV"}}
"Turn on the TV Room Roku" ->
  {"tool":"c4_tv_watch_by_name","args":{"room_name":"TV Room","source_device_name":"Roku"}}
"Turn on the basement Roku" ->
  {"tool":"c4_tv_watch_by_name","args":{"room_name":"TV Room","source_device_name":"Roku"}}
"Turn off the TV" -> {"tool":"c4_tv_off_last","args":{}}
"Turn down the volume" -> {"tool":"c4_tv_remote_last","args":{"button":"volume_down"}}
"Mute it" -> {"tool":"c4_tv_remote_last","args":{"button":"mute"}}
"Pause" -> {"tool":"c4_tv_remote_last","args":{"button":"pause"}}
"Play" -> {"tool":"c4_tv_remote_last","args":{"button":"play"}}
"Activate Movie Time" -> {"tool":"c4_scene_activate_by_name","args":{"scene_name":"Movie Time"}}`;
}

/**
 * Parse intent using OpenAI
 */
async function parseWithOpenAI(transcript, correlationId) {
  const { apiKey } = config.llm.openai;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'OpenAI API key not configured',
      500,
    );
  }

  try {
    const model = String(config.llm.openai.model || '').trim();
    const tokenLimit = 150;

    if (!model) {
      throw new Error('OpenAI model not configured');
    }

    // Some newer OpenAI reasoning models (e.g. o1/o3*) reject temperature and require max_completion_tokens.
    const isReasoningModel = /^o(1|3)(-|$)/i.test(model);

    const sanitizeModelJson = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return '';

      // Strip common markdown code fences
      const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if (fenced && fenced[1]) return fenced[1].trim();

      return text;
    };

    const parseJsonLoose = (raw) => {
      const cleaned = sanitizeModelJson(raw);
      if (!cleaned) {
        throw new Error('Empty response from LLM');
      }

      try {
        return JSON.parse(cleaned);
      } catch {
        // Try extracting the first JSON object from mixed text
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const candidate = cleaned.slice(start, end + 1);
          return JSON.parse(candidate);
        }
        throw new Error(`Invalid JSON response from LLM: ${cleaned.slice(0, 200)}`);
      }
    };

    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: transcript },
    ];

    const extractAssistantText = (data) => {
      const choice = data?.choices?.[0];
      const message = choice?.message;

      // Standard Chat Completions shape
      if (typeof message?.content === 'string') return message.content;

      // Some variants may return content as an array of parts
      if (Array.isArray(message?.content)) {
        const joined = message.content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part.text === 'string') return part.text;
            if (part && typeof part.content === 'string') return part.content;
            return '';
          })
          .join('')
          .trim();
        if (joined) return joined;
      }

      // If the model returned a tool call, extract its arguments as JSON
      const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
      if (typeof toolArgs === 'string' && toolArgs.trim()) return toolArgs;

      // Older-style completions
      if (typeof choice?.text === 'string') return choice.text;

      return '';
    };

    const callChatCompletions = async (
      tokenPayload,
      { includeTemperature, includeResponseFormat },
    ) => {
      const basePayload = {
        model,
        messages,
        ...(includeTemperature ? { temperature: 0.3 } : {}),
        ...(includeResponseFormat
          ? { response_format: { type: 'json_object' } }
          : {}),
      };

      const timeoutMs = config.llm.timeoutMs || 15000;
      let response;
      try {
        response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...basePayload, ...tokenPayload }),
        }, timeoutMs);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new AppError(
            ErrorCodes.LLM_TIMEOUT,
            `LLM request timed out after ${timeoutMs}ms`,
            504,
            { correlationId, timeoutMs, provider: 'openai' },
          );
        }
        throw err;
      }

      if (!response.ok) {
        let message = 'LLM API error';
        try {
          const error = await response.json();
          message = error.error?.message || message;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      return response.json();
    };

    const tryRequest = async (tokenPayload, options) => {
      try {
        return await callChatCompletions(tokenPayload, options);
      } catch (err) {
        const msg = String(err?.message || err);

        // Some models/endpoints don't support response_format; retry without it.
        if (options.includeResponseFormat && msg.toLowerCase().includes('response_format')) {
          return await callChatCompletions(tokenPayload, {
            ...options,
            includeResponseFormat: false,
          });
        }

        // Some models reject temperature; retry without it.
        if (
          options.includeTemperature
          && (msg.includes("Unsupported value: 'temperature'")
            || msg.includes('Only the default (1) value is supported'))
        ) {
          return await callChatCompletions(tokenPayload, {
            ...options,
            includeTemperature: false,
          });
        }

        throw err;
      }
    };

    const requestAndParse = async (tokenPayload, options) => {
      const data = await tryRequest(tokenPayload, options);
      const content = extractAssistantText(data);

      if (!content) {
        logger.warn('OpenAI returned no content', {
          correlationId,
          model,
          topLevelKeys: Object.keys(data || {}),
          choiceKeys: Object.keys(data?.choices?.[0] || {}),
          messageKeys: Object.keys(data?.choices?.[0]?.message || {}),
          finishReason: data?.choices?.[0]?.finish_reason,
        });
      }

      return parseJsonLoose(content);
    };

    // Reasoning models generally require max_completion_tokens. Others may require max_tokens.
    // Also, some models reject non-default temperature values.
    const defaultIncludeTemperature = !isReasoningModel;

    // Try progressively more permissive request options if we can't parse a valid JSON object.
    const optionAttempts = [
      { includeTemperature: defaultIncludeTemperature, includeResponseFormat: true },
      { includeTemperature: false, includeResponseFormat: true },
      { includeTemperature: false, includeResponseFormat: false },
    ];

    const tokenAttempts = [
      { key: 'max_completion_tokens', payload: { max_completion_tokens: tokenLimit } },
      { key: 'max_tokens', payload: { max_tokens: tokenLimit } },
    ];

    let lastError;
    for (const options of optionAttempts) {
      for (const tokenAttempt of tokenAttempts) {
        try {
          return await requestAndParse(tokenAttempt.payload, options);
        } catch (err) {
          lastError = err;
          const msg = String(err?.message || err);

          // If the API says a token param is unsupported, try the other param.
          if (msg.includes(`Unsupported parameter: '${tokenAttempt.key}'`)) {
            continue;
          }
        }
      }
    }

    throw lastError || new Error('LLM returned no usable JSON');
  } catch (error) {
    logger.error('OpenAI parsing error', { correlationId, error: error.message });
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      `Intent parsing failed: ${error.message}`,
      500,
    );
  }
}

/**
 * Parse intent using Anthropic
 */
async function parseWithAnthropic(_transcript, _correlationId) {
  const { apiKey } = config.llm.anthropic;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'Anthropic API key not configured',
      500,
    );
  }

  // Anthropic implementation would go here
  throw new AppError(
    ErrorCodes.LLM_ERROR,
    'Anthropic LLM not yet implemented',
    501,
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
      500,
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
