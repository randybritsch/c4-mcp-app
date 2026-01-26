const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

class MCPClient {
  constructor() {
    this._toolAllowlist = null;
  }

  _asIntOrNull(v) {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _extractAmbiguity(toolName, args, toolResp) {
    // c4-mcp returns: { ok: true, result: { ok: false, error: '...', details: { error: 'ambiguous', matches/candidates: [...] } } }
    const inner = toolResp && typeof toolResp === 'object' ? toolResp.result : null;
    const details = inner && typeof inner === 'object' ? inner.details : null;

    const isAmbiguous = details
      && typeof details === 'object'
      && String(details.error || '').toLowerCase() === 'ambiguous'
      && (Array.isArray(details.matches) || Array.isArray(details.candidates));

    if (!isAmbiguous) return null;

    const rawCandidates = Array.isArray(details.matches)
      ? details.matches
      : Array.isArray(details.candidates)
        ? details.candidates
        : [];

    const candidates = rawCandidates
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const name = c.name || c.room_name || c.device_name;
        return {
          name: name ? String(name) : null,
          room_id: c.room_id !== undefined ? this._asIntOrNull(c.room_id) : null,
          room_name: c.room_name ? String(c.room_name) : null,
          device_id: c.device_id ? String(c.device_id) : null,
          score: c.score !== undefined ? this._asIntOrNull(c.score) : null,
        };
      })
      .filter((c) => c && c.name);

    // Determine what we're disambiguating for UI copy.
    // For TV/media flows we infer based on candidate shape + tool.
    const hasDeviceIds = candidates.some((c) => c && c.device_id);
    const hasRoomIds = candidates.some((c) => c && (c.room_id !== null && c.room_id !== undefined));

    const isTvWatchByName = toolName === 'c4_tv_watch_by_name';
    const isMediaWatchLaunchByName = toolName === 'c4_media_watch_launch_app_by_name';
    const isRoomListenByName = toolName === 'c4_room_listen_by_name';

    const kind = (isTvWatchByName || isMediaWatchLaunchByName)
      ? (hasDeviceIds ? 'device' : 'room')
      : isRoomListenByName
        ? (hasRoomIds ? 'room' : 'device')
        : toolName.startsWith('c4_room_')
          ? 'room'
          : toolName.startsWith('c4_light_')
            ? 'light'
            : (hasRoomIds && !hasDeviceIds)
              ? 'room'
              : 'choice';

    const query = kind === 'room'
      ? (args && typeof args.room_name === 'string' ? args.room_name : null)
      : kind === 'light'
        ? (args && typeof args.device_name === 'string' ? args.device_name : null)
        : kind === 'device'
          ? (
            (args && typeof args.source_device_name === 'string' ? args.source_device_name : null)
            || (args && typeof args.device_name === 'string' ? args.device_name : null)
          )
          : null;

    return {
      kind,
      query,
      message: details.details || inner.error || 'Multiple matches found',
      candidates,
    };
  }

  buildRefinedIntentFromChoice(originalIntent, choice) {
    if (!originalIntent || typeof originalIntent !== 'object') return null;
    const tool = String(originalIntent.tool || '');
    const args = originalIntent.args && typeof originalIntent.args === 'object' ? { ...originalIntent.args } : {};

    if (!choice || typeof choice !== 'object') return null;

    // Make the follow-up call strict.
    args.require_unique = true;
    args.include_candidates = false;

    if (tool === 'c4_room_lights_set') {
      // c4-mcp contract: provide exactly one of room_id OR room_name.
      // Prefer room_id when present for deterministic resolution.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
        delete args.room_name;
      } else if (choice.name) {
        args.room_name = String(choice.name);
        delete args.room_id;
      }
      return { tool, args };
    }

    if (tool === 'c4_light_set_by_name') {
      if (choice.name) {
        args.device_name = String(choice.name);
      }
      // Scope by room if we have it.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
      } else if (choice.room_name) {
        args.room_name = String(choice.room_name);
      }
      return { tool, args };
    }

    if (tool === 'c4_tv_watch_by_name') {
      // Room disambiguation: carry room_id forward so the MCP tool skips name resolution.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
        if (choice.room_name) {
          args.room_name = String(choice.room_name);
        }
      }

      // Device disambiguation: update the device name (resolved by-name, but scoped to room).
      // Control4 candidates usually include the exact device name, which should make resolution unique.
      if (choice.device_id && choice.name) {
        args.source_device_name = String(choice.name);
      }

      return { tool, args };
    }

    if (tool === 'c4_media_watch_launch_app_by_name') {
      // Room disambiguation: carry room_id forward so the tool can scope device resolution.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
        // For room candidates, name is typically the room name.
        if (choice.name) {
          args.room_name = String(choice.name);
        } else if (choice.room_name) {
          args.room_name = String(choice.room_name);
        }
      }

      // Device disambiguation: update device_name to the chosen device name.
      if (choice.device_id && choice.name) {
        args.device_name = String(choice.name);
      }

      return { tool, args };
    }

    if (tool === 'c4_room_listen_by_name') {
      // Room disambiguation: carry room_id forward so the MCP tool skips name resolution.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
        if (choice.name) {
          args.room_name = String(choice.name);
        }
      }

      // Listen source disambiguation: update the source name.
      if (choice.name) {
        args.source_device_name = String(choice.name);
      }

      return { tool, args };
    }

    if (tool === 'c4_scene_activate_by_name') {
      if (choice.name) {
        args.scene_name = String(choice.name);
      }
      return { tool, args };
    }

    if (tool === 'c4_scene_set_state_by_name') {
      if (choice.name) {
        args.scene_name = String(choice.name);
      }
      return { tool, args };
    }

    // Scenes: keep as-is for now.
    return { tool, args };
  }

  _baseUrl() {
    const raw = config.control4.mcpBaseUrl;
    if (!raw || typeof raw !== 'string') {
      throw new AppError(
        ErrorCodes.MCP_CONNECTION_ERROR,
        'C4_MCP_BASE_URL is not configured',
        500,
      );
    }
    return raw.replace(/\/+$/, '');
  }

  _timeoutMs() {
    return config.control4.timeoutMs || 8000;
  }

  _getToolAllowlist() {
    if (this._toolAllowlist) return this._toolAllowlist;

    // Default allowlist is intentionally small and avoids scheduler.
    const defaultAllow = new Set([
      'c4_room_lights_set',
      'c4_light_set_by_name',
      'c4_lights_set_last',
      // TV / Media
      'c4_tv_watch_by_name',
      'c4_tv_watch',
      'c4_tv_off',
      'c4_tv_off_last',
      'c4_tv_remote',
      'c4_tv_remote_last',
      'c4_media_watch_launch_app_by_name',
      'c4_scene_activate_by_name',
      'c4_scene_set_state_by_name',
      'c4_room_listen_by_name',
      'c4_list_rooms',
      // Read-only inventory/state tools used for follow-up memory validation.
      'c4_list_devices',
      'c4_find_devices',
      'c4_resolve_device',
      'c4_light_get_state',
      // Useful for debugging/ops; safe by default.
      'c4_memory_get',
      'c4_memory_clear',
      'c4_lights_get_last',
      'c4_tv_get_last',
    ]);

    const csv = (process.env.MCP_TOOL_ALLOWLIST || '').trim();
    if (!csv) {
      this._toolAllowlist = defaultAllow;
      return this._toolAllowlist;
    }

    const parts = csv
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    this._toolAllowlist = new Set(parts);
    return this._toolAllowlist;
  }

  _assertToolAllowed(toolName) {
    const allow = this._getToolAllowlist();
    if (!allow.has(toolName)) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        `Tool not allowed: ${toolName}`,
        403,
        { tool: toolName },
      );
    }
  }

  async _fetchJson(url, options, correlationId, sessionId) {
    const controller = new AbortController();
    const timeoutMs = this._timeoutMs();

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        // Abort if possible, but also reject regardless.
        // In some environments, DNS/connect can ignore AbortController.
        controller.abort();
        const err = new Error('MCP request timeout');
        err.name = 'TimeoutError';
        reject(err);
      }, timeoutMs);
    });

    try {
      const fetchPromise = fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options && options.headers ? options.headers : {}),
          'Content-Type': 'application/json',
          ...(sessionId ? { 'X-Session-Id': String(sessionId) } : {}),
        },
      });

      const resp = await Promise.race([fetchPromise, timeoutPromise]);

      const text = await resp.text();
      let json;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = { raw: text };
      }

      if (!resp.ok) {
        throw new AppError(
          ErrorCodes.MCP_COMMAND_ERROR,
          `MCP HTTP error: ${resp.status} ${resp.statusText}`,
          502,
          {
            correlationId, url, status: resp.status, body: json,
          },
        );
      }

      return json;
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new AppError(
          ErrorCodes.MCP_COMMAND_ERROR,
          'MCP request timeout',
          504,
          { correlationId, url, timeoutMs },
        );
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCodes.MCP_CONNECTION_ERROR,
        `Failed to reach MCP server: ${error.message}`,
        502,
        { correlationId, url },
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async listTools(correlationId) {
    const url = `${this._baseUrl()}/mcp/list`;
    return this._fetchJson(url, { method: 'GET' }, correlationId, null);
  }

  async callTool(toolName, args, correlationId, sessionId) {
    this._assertToolAllowed(toolName);
    const url = `${this._baseUrl()}/mcp/call`;
    const body = {
      kind: 'tool',
      name: toolName,
      args: args || {},
    };
    return this._fetchJson(
      url,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      correlationId,
      sessionId,
    );
  }

  /**
   * Send command to Control4 via MCP
   */
  async sendCommand(intent, correlationId, sessionId) {
    if (!intent || typeof intent !== 'object') {
      throw new AppError(
        ErrorCodes.USER_INPUT_ERROR,
        'Invalid intent',
        400,
      );
    }

    // Preferred shape: { tool: "c4_room_lights_set", args: {...} }
    if (intent.tool && intent.args) {
      const toolName = String(intent.tool);
      const { args } = intent;

      logger.info('Sending MCP tool call', {
        correlationId,
        tool: toolName,
        args,
      });

      const result = await this.callTool(toolName, args, correlationId, sessionId);
      const clarification = this._extractAmbiguity(toolName, args, result);
      if (clarification) {
        return {
          success: false,
          tool: toolName,
          args,
          clarification,
          result,
          timestamp: new Date().toISOString(),
        };
      }

      // Treat tool-level failures as non-success.
      if (result && typeof result === 'object' && result.result && result.result.ok === false) {
        return {
          success: false,
          tool: toolName,
          args,
          result,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        tool: toolName,
        args,
        result,
        timestamp: new Date().toISOString(),
      };
    }

    // Back-compat: translate legacy intent shapes into tool calls.
    const translated = this.translateIntentToToolCall(intent);
    logger.info('Translated intent to tool call', {
      correlationId,
      intent,
      translated,
    });

    const result = await this.callTool(translated.tool, translated.args, correlationId, sessionId);
    return {
      success: true,
      tool: translated.tool,
      args: translated.args,
      result,
      timestamp: new Date().toISOString(),
    };
  }

  translateIntentToToolCall(intent) {
    const action = String(intent.action || '').toLowerCase();
    const target = String(intent.target || '').toLowerCase();
    const roomName = intent.room_name || intent.roomName || intent.room;
    const level = intent.level ?? intent.value;

    if (target === 'lights') {
      if (!roomName || typeof roomName !== 'string') {
        throw new AppError(
          ErrorCodes.USER_INPUT_ERROR,
          'Missing room_name for lights command',
          400,
        );
      }

      if (action === 'turn_on' || action === 'on') {
        return { tool: 'c4_room_lights_set', args: { room_name: roomName, state: 'on' } };
      }
      if (action === 'turn_off' || action === 'off') {
        return { tool: 'c4_room_lights_set', args: { room_name: roomName, state: 'off' } };
      }
      if (action === 'set_brightness' || action === 'dim' || action === 'brightness') {
        if (level === undefined || level === null || Number.isNaN(Number(level))) {
          throw new AppError(
            ErrorCodes.USER_INPUT_ERROR,
            'Missing level for set_brightness',
            400,
          );
        }
        return {
          tool: 'c4_room_lights_set',
          args: { room_name: roomName, level: Math.max(0, Math.min(100, Number(level))) },
        };
      }
    }

    if (target === 'scene') {
      const sceneName = intent.scene_name || intent.sceneName || intent.value;
      if (!sceneName || typeof sceneName !== 'string') {
        throw new AppError(
          ErrorCodes.USER_INPUT_ERROR,
          'Missing scene_name for scene command',
          400,
        );
      }
      return {
        tool: 'c4_scene_activate_by_name',
        args: { scene_name: sceneName, room_name: roomName || undefined },
      };
    }

    throw new AppError(
      ErrorCodes.USER_INPUT_ERROR,
      'Unsupported intent',
      400,
      { intent },
    );
  }
}

// Singleton instance
const mcpClient = new MCPClient();

module.exports = mcpClient;
