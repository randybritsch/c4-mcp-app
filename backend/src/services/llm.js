const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');
const { readLockedGeminiPrompt } = require('../utils/locked-gemini-prompt');

function sanitizeModelJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  // Strip common markdown code fences
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  return text;
}

function parseJsonLoose(raw) {
  const cleaned = sanitizeModelJson(raw);
  if (!cleaned) {
    throw new Error('Empty response from LLM');
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const candidate = cleaned.slice(start, end + 1);
      return JSON.parse(candidate);
    }
    throw new Error(`Invalid JSON response from LLM: ${cleaned.slice(0, 200)}`);
  }
}

function normalizeGeminiModelName(rawModel) {
  let model = String(rawModel || '').trim();
  if (!model) return '';

  // Allow users to paste full resource names.
  if (/^models\//i.test(model)) {
    model = model.replace(/^models\//i, '');
  }

  // Common typo: "gemeni" -> "gemini".
  model = model.replace(/^gemeni-/i, 'gemini-');

  return model;
}

async function listGoogleGeminiModels(apiKey, correlationId) {
  const timeoutMs = config.llm.timeoutMs || 15000;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, timeoutMs);

  if (!response.ok) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'Failed to list Gemini models',
      response.status || 500,
      { provider: 'google', correlationId, providerStatus: response.status },
    );
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];

  return models
    .map((m) => {
      const name = String(m?.name || '').trim();
      const supported = Array.isArray(m?.supportedGenerationMethods)
        ? m.supportedGenerationMethods.map((s) => String(s).trim()).filter(Boolean)
        : [];
      return { name, supportedGenerationMethods: supported };
    })
    .filter((m) => m.name);
}

function pickGeminiGenerateContentModel(models, preferredModel) {
  const preferred = normalizeGeminiModelName(preferredModel);

  const candidates = (Array.isArray(models) ? models : [])
    .map((m) => {
      const normalizedName = normalizeGeminiModelName(m?.name);
      const supported = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      const supportsGenerateContent = supported.some((s) => /^generatecontent$/i.test(String(s)));
      return { normalizedName, supportsGenerateContent };
    })
    .filter((m) => m.normalizedName && m.supportsGenerateContent);

  if (preferred) {
    const exact = candidates.find((c) => c.normalizedName === preferred);
    if (exact) return exact.normalizedName;
  }

  // Prefer fast “flash” models when available.
  const flash = candidates.find((c) => /flash/i.test(c.normalizedName));
  if (flash) return flash.normalizedName;

  return candidates[0]?.normalizedName || '';
}

function parseWithHeuristics(transcript) {
  const raw = String(transcript || '').trim();
  const t = raw.toLowerCase();

  const cleanRoom = (s) => {
    const room = String(s || '').trim();
    if (!room) return '';
    // Avoid treating "the" as a room.
    if (/^the$/i.test(room)) return '';
    return room;
  };

  if (!raw) {
    return null;
  }

  // Rooms
  if (/^\s*list\s+rooms\s*$/i.test(raw)) {
    return { tool: 'c4_list_rooms', args: {} };
  }

  // Room presence
  // Examples:
  // - "I'm in the TV room"
  // - "I am in TV Room"
  // - "We're in the basement"
  // Notes:
  // - This sets context for follow-ups by executing c4_room_presence_report.
  // - Ambiguity is handled upstream by clarification-required.
  const presenceMatch = raw.match(/^\s*(?:i\s*['’]?m|i\s+am|we\s*['’]?re|we\s+are)\s+in\s+(?:the\s+)?(.+?)\s*$/i);
  if (presenceMatch) {
    const room = cleanRoom(presenceMatch[1]);
    if (room) {
      return {
        tool: 'c4_room_presence_report',
        args: {
          room_name: room,
        },
      };
    }
  }

  // TV follow-ups (no room required; relies on MCP session memory)
  if (/\b(turn\s+off|power\s+off|shut\s+off)\b/.test(t) && /\b(tv|television)\b/.test(t)) {
    return { tool: 'c4_tv_off_last', args: {} };
  }

  // TV "watch" / source selection (room + source)
  // Examples:
  // - "Watch Roku in Basement"
  // - "Watch Apple TV in Family Room"
  const watchIn = raw.match(/^\s*watch\s+(.+?)\s+in\s+(?:the\s+)?(.+?)\s*$/i);
  if (watchIn) {
    const source = String(watchIn[1] || '').trim();
    const room = cleanRoom(watchIn[2]);
    if (source && room) {
      return {
        tool: 'c4_tv_watch_by_name',
        args: {
          room_name: room,
          source_device_name: source,
        },
      };
    }
  }

  // TV "turn on" / "watch" source selection without an explicit "in".
  // Example:
  // - "Turn on the Basement Roku" -> room="Basement", source="Roku"
  // Heuristic: if the phrase looks like "<room> <source>", treat the tail as the source.
  const watchRoomSource = raw.match(/^\s*(?:turn\s+on|switch\s+on|watch)\s+(?:the\s+)?(.+?)\s*$/i);
  if (watchRoomSource) {
    const rest = String(watchRoomSource[1] || '').trim();
    if (rest) {
      // Avoid hijacking light commands like "Turn on the kitchen lights".
      if (/\b(lights?|lamps?)\b/i.test(rest)) {
        // fall through to lights heuristics below
      } else {
      const multiWordSources = [
        'apple tv',
        'fire tv',
        'chrome cast',
        'chromecast',
        'xbox one',
        'xbox series x',
        'xbox series s',
        'playstation 5',
        'playstation 4',
        'ps5',
        'ps4',
      ].sort((a, b) => b.length - a.length);

      const restLower = rest.toLowerCase();
      let source;
      let roomPart;

      const matchedTail = multiWordSources.find((s) => restLower === s || restLower.endsWith(` ${s}`));
      if (matchedTail) {
        source = rest.slice(rest.length - matchedTail.length).trim();
        roomPart = rest.slice(0, rest.length - matchedTail.length).trim();
      } else {
        const parts = rest.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          source = parts[parts.length - 1];
          roomPart = parts.slice(0, -1).join(' ');
        }
      }

      const room = cleanRoom(roomPart);
      if (room && source) {
        return {
          tool: 'c4_tv_watch_by_name',
          args: {
            room_name: room,
            source_device_name: String(source).trim(),
          },
        };
      }
      }
    }
  }

  if (/\b(mute)\b/.test(t)) {
    return { tool: 'c4_tv_remote_last', args: { button: 'mute' } };
  }

  if (/\b(turn\s+down|quieter|lower)\b/.test(t) && /\b(volume|sound)\b/.test(t)) {
    return { tool: 'c4_tv_remote_last', args: { button: 'volume_down' } };
  }

  if (/\b(turn\s+up|louder|raise)\b/.test(t) && /\b(volume|sound)\b/.test(t)) {
    return { tool: 'c4_tv_remote_last', args: { button: 'volume_up' } };
  }

  if (/^\s*(pause|play)\s*$/i.test(raw)) {
    return { tool: 'c4_tv_remote_last', args: { button: /^\s*pause\s*$/i.test(raw) ? 'pause' : 'play' } };
  }

  // Lights by room
  // Examples:
  // - "Turn on the kitchen lights"
  // - "Turn on lights in the kitchen"
  // - "Set kitchen lights to 30%"
  const lightsOn1 = raw.match(/^\s*(turn|switch)\s+on\s+(?:the\s+)?(.+?)\s+lights?\s*$/i);
  if (lightsOn1) {
    const room = cleanRoom(lightsOn1[2]);
    return {
      tool: 'c4_room_lights_set',
      args: room ? { room_name: room, state: 'on' } : { state: 'on' },
    };
  }

  const lightsOff1 = raw.match(/^\s*(turn|switch)\s+off\s+(?:the\s+)?(.+?)\s+lights?\s*$/i);
  if (lightsOff1) {
    const room = cleanRoom(lightsOff1[2]);
    return {
      tool: 'c4_room_lights_set',
      args: room ? { room_name: room, state: 'off' } : { state: 'off' },
    };
  }

  const lightsOn2 = raw.match(/^\s*(turn|switch)\s+on\s+lights?\s+in\s+(?:the\s+)?(.+?)\s*$/i);
  if (lightsOn2) {
    const room = cleanRoom(lightsOn2[2]);
    return {
      tool: 'c4_room_lights_set',
      args: room ? { room_name: room, state: 'on' } : { state: 'on' },
    };
  }

  const lightsOff2 = raw.match(/^\s*(turn|switch)\s+off\s+lights?\s+in\s+(?:the\s+)?(.+?)\s*$/i);
  if (lightsOff2) {
    const room = cleanRoom(lightsOff2[2]);
    return {
      tool: 'c4_room_lights_set',
      args: room ? { room_name: room, state: 'off' } : { state: 'off' },
    };
  }

  const lightsLevel = raw.match(/^\s*(set|dim|brighten)\s+(?:the\s+)?(.+?)\s+lights?\s+(?:to\s+)?(\d{1,3})\s*%?\s*$/i);
  if (lightsLevel) {
    const room = cleanRoom(lightsLevel[2]);
    const level = Math.max(0, Math.min(100, Number(lightsLevel[3])));
    return {
      tool: 'c4_room_lights_set',
      args: room ? { room_name: room, level } : { level },
    };
  }

  // Simple scene activation (no room scope)
  const sceneActivate = raw.match(/^\s*(activate|start|run)\s+(.+?)\s*$/i);
  if (sceneActivate) {
    const scene = String(sceneActivate[2] || '').trim();
    if (scene) {
      return { tool: 'c4_scene_activate_by_name', args: { scene_name: scene } };
    }
  }

  return null;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(timeoutMs) || 0);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function _formatToolCatalogForPrompt(toolCatalog) {
  // Accept a few shapes defensively:
  // - { tools: [ { name, description, inputSchema|parameters|args_schema } ] }
  // - { tools: { toolName: { description, inputSchema|... } } }
  // - [ { name, ... } ]
  const raw = toolCatalog;
  let tools = [];

  if (Array.isArray(raw)) {
    tools = raw;
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.tools)) {
      tools = raw.tools;
    } else if (raw.tools && typeof raw.tools === 'object') {
      // Object map -> array
      tools = Object.entries(raw.tools).map(([name, spec]) => ({ name, ...(spec || {}) }));
    } else if (Array.isArray(raw.items)) {
      tools = raw.items;
    }
  }

  tools = tools
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const name = t.name ? String(t.name) : '';
      if (!name) return null;

      const description = t.description ? String(t.description) : '';
      const schema = t.inputSchema || t.input_schema || t.parameters || t.args_schema || t.schema || null;

      // Keep it compact: we only need the argument surface.
      const schemaSummary = (() => {
        if (!schema || typeof schema !== 'object') return null;
        const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
        const required = Array.isArray(schema.required) ? schema.required : [];
        if (!props) return null;
        const keys = Object.keys(props);
        if (keys.length === 0) return null;

        const args = keys.slice(0, 20).map((k) => {
          const p = props[k] || {};
          const type = p.type ? String(p.type) : 'any';
          const isRequired = required.includes(k);
          return `${k}${isRequired ? '*' : ''}:${type}`;
        });

        return `{ ${args.join(', ')} }`;
      })();

      return { name, description, schemaSummary };
    })
    .filter(Boolean);

  // Avoid prompt bloat.
  tools = tools.slice(0, 60);

  if (tools.length === 0) return '';

  const lines = tools.map((t) => {
    const bits = [`- ${t.name}`];
    if (t.description) bits.push(`: ${t.description}`);
    if (t.schemaSummary) bits.push(` Args ${t.schemaSummary}`);
    return bits.join('');
  });

  return `\n\nAllowed tools (choose ONE):\n${lines.join('\n')}`;
}

function buildSystemPrompt(options) {
  const toolCatalogBlock = options && options.toolCatalog
    ? _formatToolCatalogForPrompt(options.toolCatalog)
    : '';

  const currentRoom = options && options.context && options.context.currentRoom
    ? options.context.currentRoom
    : null;

  const currentRoomName = currentRoom && currentRoom.room_name ? String(currentRoom.room_name).trim() : '';
  const currentRoomId = (currentRoom && currentRoom.room_id !== undefined && currentRoom.room_id !== null)
    ? String(currentRoom.room_id).trim()
    : '';

  const contextBlock = (currentRoomName || currentRoomId)
    ? `\n\nContext:\n- Current room: ${currentRoomName || '(unknown name)'}${currentRoomId ? ` (room_id=${currentRoomId})` : ''}\n\nIf the user omits a room for a room-scoped action, prefer the current room context.`
    : '';

  const configuredScenes = Array.isArray(config?.scenes?.names) ? config.scenes.names : [];
  const scenesBlock = configuredScenes.length
    ? `\n\nKnown scene names (prefer these exactly when recommending a scene):\n${configuredScenes
      .slice(0, 40)
      .map((s) => `- ${s}`)
      .join('\n')}`
    : '';

  return `You are a smart home command planner.
Convert a user's natural language into a SINGLE Control4 tool call for the c4-mcp HTTP server.
${contextBlock}

Return ONLY valid JSON in this exact shape:
{
  "tool": "tool_name",
  "args": { ... }
}

${toolCatalogBlock || `\n\nAllowed tools (choose ONE):\n- c4_room_presence_report\n- c4_room_lights_set\n- c4_light_set_by_name\n- c4_lights_set_last\n- c4_tv_watch_by_name\n- c4_tv_off\n- c4_tv_off_last\n- c4_tv_remote_last\n- c4_scene_activate_by_name\n- c4_scene_set_state_by_name\n- c4_list_rooms`}

New capability: Mood / vibe requests
- If the user expresses a mood or vibe (e.g. "I'm in a romantic mood", "make it cozy", "party mode", "set the mood"),
  recommend an appropriate scene by returning tool c4_scene_activate_by_name.
- If known scene names are provided, choose the best matching one from that list.
- If no scene list is provided, choose a reasonable scene_name that reflects the mood
  (examples: Romantic, Cozy, Relax, Party, Movie Time, Night).

Rules:
- Prefer c4_room_lights_set when the user mentions a room (e.g. "Basement").
- If a current room context is provided and the user omits a room for a room-scoped action, use that current room.
- Use room_name/device_name/scene_name exactly as spoken (Title Case is fine). Do NOT invent IDs.
- If the user states where they are (presence), e.g. "I'm in the Master Bedroom" or "We're in the basement",
  use c4_room_presence_report with args {"room_name":"<Room>"} so the system can confirm/set room context and return a status report.
- If the user uses pronouns or follow-ups that refer to the previous light(s)
  (e.g. "turn it back on", "turn them back off", "undo that", "those lights", "back on", "again"),
  use c4_lights_set_last with args {"state":"on|off"} or {"level":0-100}.
- If the user refers to the TV/media as a follow-up without specifying a room
  (e.g. "turn off the TV", "turn it off", "shut it down"), use c4_tv_off_last with args {}.
- If the user says to "turn on the TV" (or similar) but does NOT specify a source/app/device,
  and you have a current room context, return c4_room_list_video_devices with {"room_id":"<id>"} so the app can ask which source to use.
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
"I'm in the Master Bedroom" -> {"tool":"c4_room_presence_report","args":{"room_name":"Master Bedroom"}}
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

function buildGeminiSystemPrompt(options) {
  // Base (locked) policy prompt.
  const locked = readLockedGeminiPrompt();

  // Dynamic blocks: current room context + allowed tool catalog.
  const toolCatalogBlock = options && options.toolCatalog
    ? _formatToolCatalogForPrompt(options.toolCatalog)
    : '';

  const currentRoom = options && options.context && options.context.currentRoom
    ? options.context.currentRoom
    : null;

  const currentRoomName = currentRoom && currentRoom.room_name ? String(currentRoom.room_name).trim() : '';
  const currentRoomId = (currentRoom && currentRoom.room_id !== undefined && currentRoom.room_id !== null)
    ? String(currentRoom.room_id).trim()
    : '';

  const contextBlock = (currentRoomName || currentRoomId)
    ? `\n\nContext:\n- Current room: ${currentRoomName || '(unknown name)'}${currentRoomId ? ` (room_id=${currentRoomId})` : ''}`
    : '';

  // Critical: keep the backend contract deterministic.
  // Even though the locked prompt discusses "a confirmation question", our backend transport expects JSON.
  // The UI will handle follow-ups/clarifications when needed.
  const outputContract = `\n\nReturn ONLY valid JSON in this exact shape:\n{\n  "tool": "tool_name",\n  "args": { ... }\n}`;

  const allowedToolsBlock = toolCatalogBlock || `\n\nAllowed tools (choose ONE):\n- c4_room_presence_report\n- c4_room_lights_set\n- c4_light_set_by_name\n- c4_lights_set_last\n- c4_tv_watch_by_name\n- c4_tv_watch\n- c4_tv_off\n- c4_tv_off_last\n- c4_tv_remote_last\n- c4_media_watch_launch_app_by_name\n- c4_room_list_video_devices\n- c4_scene_activate_by_name\n- c4_scene_set_state_by_name\n- c4_list_rooms`;

  return `${locked.trim()}${contextBlock}${outputContract}${allowedToolsBlock}`;
}

/**
 * Parse intent using OpenAI
 */
async function parseWithOpenAI(transcript, correlationId, options) {
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

    // parseJsonLoose/sanitizeModelJson are defined at module scope for reuse across providers.

    const messages = [
      { role: 'system', content: buildSystemPrompt(options) },
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
        let errorType;
        let errorCode;
        try {
          const error = await response.json();
          message = error.error?.message || message;
          errorType = error.error?.type;
          errorCode = error.error?.code;
        } catch {
          // ignore parse errors
        }

        throw new AppError(
          ErrorCodes.LLM_ERROR,
          message,
          response.status || 500,
          {
            provider: 'openai',
            correlationId,
            providerStatus: response.status,
            errorType,
            errorCode,
          },
        );
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
    if (error instanceof AppError) {
      // Preserve status/details for upstream fallback logic.
      throw error;
    }

    logger.error('OpenAI parsing error', { correlationId, error: error.message });
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      `Intent parsing failed: ${error.message}`,
      500,
    );
  }
}

/**
 * Parse intent using Google Gemini (generativelanguage API).
 * Docs: https://ai.google.dev/gemini-api/docs
 */
async function parseWithGoogleGemini(transcript, correlationId, options) {
  const apiKey = config?.llm?.google?.apiKey;
  if (!apiKey) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'Google Gemini API key not configured',
      500,
    );
  }

  const configuredModel = String(config?.llm?.google?.model || '').trim();
  const model = normalizeGeminiModelName(configuredModel);
  if (!model) {
    throw new AppError(
      ErrorCodes.LLM_ERROR,
      'Google Gemini model not configured',
      500,
    );
  }

  if (model !== configuredModel) {
    logger.warn('Normalized Google Gemini model name', {
      correlationId,
      provider: 'google',
      configuredModel,
      normalizedModel: model,
    });
  }

  const timeoutMs = config.llm.timeoutMs || 15000;

  const requestGemini = async (modelName) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response;
    try {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildGeminiSystemPrompt(options) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: String(transcript || '') }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }, timeoutMs);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new AppError(
          ErrorCodes.LLM_TIMEOUT,
          `LLM request timed out after ${timeoutMs}ms`,
          504,
          { correlationId, timeoutMs, provider: 'google' },
        );
      }
      throw err;
    }

    return response;
  };

  let response = await requestGemini(model);

  if (!response.ok) {
    let message = 'LLM API error';
    let errorStatus;
    let errorCode;
    try {
      const data = await response.json();
      message = data?.error?.message || message;
      errorStatus = data?.error?.status;
      errorCode = data?.error?.code;
    } catch {
      // ignore parse errors
    }

    const status = response.status || 500;
    const isModelNotFound = status === 404
      || (status === 400 && /not\s+found\s+for\s+api\s+version|not\s+supported\s+for\s+generatecontent/i.test(String(message || '')));

    // If the configured model isn't available for this API key/version, attempt to auto-select
    // an available model that supports generateContent (via ListModels) and retry once.
    if (isModelNotFound) {
      try {
        const models = await listGoogleGeminiModels(apiKey, correlationId);
        const fallbackModel = pickGeminiGenerateContentModel(models, model);
        if (fallbackModel && fallbackModel !== model) {
          logger.warn('Configured Gemini model unavailable; retrying with an available model', {
            correlationId,
            provider: 'google',
            configuredModel: model,
            fallbackModel,
          });

          response = await requestGemini(fallbackModel);
          if (response.ok) {
            const retryData = await response.json();
            const retryText = retryData?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
            return parseJsonLoose(retryText);
          }
        }
      } catch (e) {
        logger.warn('Failed to auto-select Gemini model after model-not-found', {
          correlationId,
          provider: 'google',
          error: String(e?.message || e),
        });
      }
    }

    throw new AppError(
      ErrorCodes.LLM_ERROR,
      message,
      status,
      {
        provider: 'google',
        correlationId,
        providerStatus: status,
        errorStatus,
        errorCode,
      },
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
  return parseJsonLoose(text);
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
async function parseIntent(transcript, correlationId, options = {}) {
  logger.info('Starting intent parsing', {
    correlationId,
    provider: config.llm.provider,
    transcript,
  });

  const startTime = Date.now();

  let intent;
  const provider = String(config.llm.provider || '').trim().toLowerCase();
  const allowHeuristicsFallback = Boolean(config?.llm?.allowHeuristicsFallback);

  const shouldFallbackToHeuristicsFromLlmError = (err) => {
    const msg = String(err?.message || err || '');
    const statusCode = Number(err?.statusCode || err?.status || err?.details?.providerStatus || 0);

    // OpenAI quota/billing/rate-limit issues should not make the system unusable.
    if (statusCode === 402 || statusCode === 429) return true;

    // Google quota/rate-limit issues (often 429 or 403 RESOURCE_EXHAUSTED).
    if (statusCode === 403) {
      if (/quota|resource[_\s-]?exhausted|rate\s*limit|too\s+many\s+requests/i.test(msg)) return true;
    }

    // Google model-name issues (typos, deprecated model, wrong API version) shouldn't hard-fail.
    if (statusCode === 404) return true;
    if (statusCode === 400) {
      if (/not\s+found\s+for\s+api\s+version|not\s+supported\s+for\s+generatecontent/i.test(msg)) return true;
    }

    return /exceeded\s+your\s+current\s+quota|insufficient[_\s-]?quota|billing\s+details|check\s+your\s+plan|rate\s*limit|too\s+many\s+requests/i
      .test(msg);
  };

  if (provider === 'heuristic' || provider === 'heuristics' || provider === 'none' || provider === 'disabled') {
    intent = parseWithHeuristics(transcript);
  } else if (provider === 'openai') {
    const hasKey = Boolean(config?.llm?.openai?.apiKey);
    if (!hasKey) {
      if (allowHeuristicsFallback) {
        logger.warn('OpenAI API key not configured; falling back to heuristic intent parsing', { correlationId });
        intent = parseWithHeuristics(transcript);
      } else {
        throw new AppError(
          ErrorCodes.LLM_ERROR,
          'OpenAI API key not configured (heuristic fallback disabled). Set OPENAI_API_KEY or set LLM_ALLOW_HEURISTICS_FALLBACK=1 for limited commands.',
          500,
          { provider: 'openai', correlationId },
        );
      }
    } else {
      try {
        intent = await parseWithOpenAI(transcript, correlationId, options);
      } catch (err) {
        if (allowHeuristicsFallback && shouldFallbackToHeuristicsFromLlmError(err)) {
          logger.warn('OpenAI unavailable (quota/rate-limit/billing); falling back to heuristic intent parsing', {
            correlationId,
            error: String(err?.message || err),
            statusCode: err?.statusCode,
          });
          intent = parseWithHeuristics(transcript);
        } else {
          throw err;
        }
      }
    }
  } else if (provider === 'anthropic') {
    const hasKey = Boolean(config?.llm?.anthropic?.apiKey);
    if (!hasKey) {
      if (allowHeuristicsFallback) {
        logger.warn('Anthropic API key not configured; falling back to heuristic intent parsing', { correlationId });
        intent = parseWithHeuristics(transcript);
      } else {
        throw new AppError(
          ErrorCodes.LLM_ERROR,
          'Anthropic API key not configured (heuristic fallback disabled). Set ANTHROPIC_API_KEY or set LLM_ALLOW_HEURISTICS_FALLBACK=1 for limited commands.',
          500,
          { provider: 'anthropic', correlationId },
        );
      }
    } else {
      intent = await parseWithAnthropic(transcript, correlationId);
    }
  } else if (provider === 'google' || provider === 'gemini') {
    const hasKey = Boolean(config?.llm?.google?.apiKey);
    if (!hasKey) {
      if (allowHeuristicsFallback) {
        logger.warn('Google Gemini API key not configured; falling back to heuristic intent parsing', { correlationId });
        intent = parseWithHeuristics(transcript);
      } else {
        throw new AppError(
          ErrorCodes.LLM_ERROR,
          'Google Gemini API key not configured (heuristic fallback disabled). Set GOOGLE_GEMINI_API_KEY.',
          500,
          { provider: 'google', correlationId },
        );
      }
    } else {
      try {
        intent = await parseWithGoogleGemini(transcript, correlationId, options);
      } catch (err) {
        if (allowHeuristicsFallback && shouldFallbackToHeuristicsFromLlmError(err)) {
          logger.warn('Google Gemini unavailable; falling back to heuristic intent parsing', {
            correlationId,
            error: String(err?.message || err),
            statusCode: err?.statusCode,
          });
          intent = parseWithHeuristics(transcript);
        } else {
          throw err;
        }
      }
    }
  } else {
    if (allowHeuristicsFallback) {
      intent = parseWithHeuristics(transcript);
    } else {
      throw new AppError(
        ErrorCodes.LLM_ERROR,
        `Unsupported LLM_PROVIDER '${provider}' (heuristic fallback disabled).`,
        500,
        { provider, correlationId },
      );
    }
  }

  if (!intent) {
    const providerHelp = (() => {
      if (provider === 'openai') return 'set OPENAI_API_KEY';
      if (provider === 'google' || provider === 'gemini') return 'set GOOGLE_GEMINI_API_KEY (and optionally GOOGLE_GEMINI_MODEL)';
      if (provider === 'anthropic') return 'set ANTHROPIC_API_KEY';
      return 'set an LLM API key';
    })();

    const fallbackHint = allowHeuristicsFallback
      ? 'Heuristic fallback is enabled, but this command was outside the limited supported set.'
      : 'Heuristic fallback is disabled to preserve the "Gemini decides" contract.';

    throw new AppError(
      ErrorCodes.USER_INPUT_ERROR,
      `Could not understand that command. ${fallbackHint} If you want full natural-language support, ${providerHelp}.`,
      400,
      { provider, correlationId },
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
