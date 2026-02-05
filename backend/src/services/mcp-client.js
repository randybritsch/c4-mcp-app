const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

class MCPClient {
  constructor() {
    this._toolAllowlist = null;
    this._toolCatalogCache = null;
    this._toolCatalogCacheAtMs = 0;
  }

  _normalizeArgsForTool(toolName, rawArgs) {
    const args = (rawArgs && typeof rawArgs === 'object') ? { ...rawArgs } : {};

    // Normalize common room key variants (Gemini sometimes emits `room` instead of `room_name`).
    const roomValue = (typeof args.room_name === 'string' ? args.room_name : null)
      || (typeof args.roomName === 'string' ? args.roomName : null)
      || (typeof args.room === 'string' ? args.room : null);
    if (roomValue && (!args.room_name || typeof args.room_name !== 'string')) {
      args.room_name = String(roomValue);
    }
    delete args.room;
    delete args.roomName;

    // Internal planner flags that only some tools support.
    // When passed to tools that don't accept them, c4-mcp may 500 on schema validation.
    const toolsAllowingPlannerFlags = new Set([
      'c4_tv_watch_by_name',
      'c4_room_listen_by_name',
      'c4_room_lights_set',
      'c4_light_set_by_name',
      'c4_scene_activate_by_name',
      'c4_scene_set_state_by_name',
      'c4_media_watch_launch_app_by_name',
      'c4_media_watch_launch_app',
    ]);

    if (!toolsAllowingPlannerFlags.has(toolName)) {
      delete args.include_candidates;
      delete args.require_unique;
    }

    // Compatibility shims for LLM/planner outputs.
    // c4-mcp tool schemas are strict; passing unexpected args can 500.
    if (toolName === 'c4_tv_watch_by_name' || toolName === 'c4_room_listen_by_name') {
      const source = (typeof args.source_device_name === 'string' ? args.source_device_name : null)
        || (typeof args.sourceDeviceName === 'string' ? args.sourceDeviceName : null);
      const video = (typeof args.video_device_name === 'string' ? args.video_device_name : null)
        || (typeof args.videoDeviceName === 'string' ? args.videoDeviceName : null);
      const device = (typeof args.device_name === 'string' ? args.device_name : null)
        || (typeof args.deviceName === 'string' ? args.deviceName : null);

      const pick = (v) => (v && String(v).trim() ? String(v).trim() : null);
      const chosen = pick(source) || pick(video) || pick(device);
      if (chosen) {
        args.source_device_name = chosen;
      }

      // These tools do not accept device_name/video_device_name; keep only source_device_name.
      delete args.device_name;
      delete args.deviceName;
      delete args.video_device_name;
      delete args.videoDeviceName;
      delete args.sourceDeviceName;
    }

    // Some callers/LLMs add `include_candidates` to c4_room_presence_report; c4-mcp doesn't accept it.
    if (toolName === 'c4_room_presence_report') {
      delete args.include_candidates;
      delete args.require_unique;
    }

    // App launch tools are strict: normalize common key variants.
    if (toolName === 'c4_media_watch_launch_app_by_name' || toolName === 'c4_media_watch_launch_app') {
      const app = (typeof args.app === 'string' ? args.app : null)
        || (typeof args.app_name === 'string' ? args.app_name : null)
        || (typeof args.appName === 'string' ? args.appName : null)
        || (typeof args.application === 'string' ? args.application : null);
      if (app && (!args.app || typeof args.app !== 'string')) {
        args.app = String(app);
      }
      delete args.app_name;
      delete args.appName;
      delete args.application;

      // Gemini sometimes uses `source_device_name` for these tools; by-name variant expects `device_name`.
      if (toolName === 'c4_media_watch_launch_app_by_name') {
        const device = (typeof args.device_name === 'string' ? args.device_name : null)
          || (typeof args.deviceName === 'string' ? args.deviceName : null)
          || (typeof args.source_device_name === 'string' ? args.source_device_name : null)
          || (typeof args.sourceDeviceName === 'string' ? args.sourceDeviceName : null);
        if (device && (!args.device_name || typeof args.device_name !== 'string')) {
          args.device_name = String(device);
        }
        delete args.deviceName;
        delete args.source_device_name;
        delete args.sourceDeviceName;
      }
    }

    return args;
  }

  getToolAllowlist() {
    return Array.from(this._getToolAllowlist());
  }

  _extractToolsArrayFromListResponse(listResp) {
    // Defensive normalization: upstream list response shapes can vary.
    if (Array.isArray(listResp)) return listResp;

    if (listResp && typeof listResp === 'object') {
      if (Array.isArray(listResp.tools)) return listResp.tools;
      if (listResp.tools && typeof listResp.tools === 'object') {
        return Object.entries(listResp.tools).map(([name, spec]) => ({ name, ...(spec || {}) }));
      }
      if (Array.isArray(listResp.items)) return listResp.items;
    }

    return [];
  }

  _filterToolCatalogForAllowlist(toolSpecs) {
    const allow = this._getToolAllowlist();
    return (Array.isArray(toolSpecs) ? toolSpecs : [])
      .map((t) => {
        if (!t || typeof t !== 'object') return null;
        const name = t.name ? String(t.name) : '';
        if (!name) return null;
        if (!allow.has(name)) return null;
        return t;
      })
      .filter(Boolean);
  }

  async getAllowedToolCatalogForLlm(correlationId) {
    // Cache for a short period to avoid hitting MCP /mcp/list on every voice command.
    const ttlMs = Number(process.env.MCP_TOOL_CATALOG_TTL_MS || 5 * 60 * 1000);
    const now = Date.now();
    if (this._toolCatalogCache && (now - this._toolCatalogCacheAtMs) < ttlMs) {
      return this._toolCatalogCache;
    }

    try {
      const listResp = await this.listTools(correlationId);
      const tools = this._extractToolsArrayFromListResponse(listResp);
      const allowed = this._filterToolCatalogForAllowlist(tools);
      const catalogForPrompt = { tools: allowed };

      this._toolCatalogCache = catalogForPrompt;
      this._toolCatalogCacheAtMs = now;
      return catalogForPrompt;
    } catch (err) {
      logger.warn('Failed to fetch MCP tool catalog; continuing without it', {
        correlationId,
        error: String(err?.message || err),
      });

      // Keep existing cache (if any) even on failure.
      return this._toolCatalogCache;
    }
  }

  _asIntOrNull(v) {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _extractAmbiguity(toolName, args, toolResp) {
    // c4-mcp returns tool results in a couple of common shapes:
    // - { result: { ok:false, error:'ambiguous', details:{ error:'ambiguous', matches/candidates:[...] } } }
    // - { result: { ok:false, error:'ambiguous', matches/candidates:[...], details:'Multiple rooms could match ...' } }
    const inner = toolResp && typeof toolResp === 'object' ? toolResp.result : null;
    if (!inner || typeof inner !== 'object') return null;

    const innerDetailsObj = (inner.details && typeof inner.details === 'object') ? inner.details : null;
    const payload = innerDetailsObj || inner;

    // Ambiguity payloads vary slightly by tool:
    // - Some return: inner.error === 'ambiguous' with candidates in inner.matches
    // - Others return: inner.details.error === 'ambiguous' with candidates in inner.details.matches
    const ambiguousCode = String(
      (innerDetailsObj && typeof innerDetailsObj === 'object' ? innerDetailsObj.error : null)
      || (inner && typeof inner === 'object' ? inner.error : null)
      || (payload && typeof payload === 'object' ? payload.error : null)
      || '',
    ).toLowerCase();

    const rawCandidates = Array.isArray(payload.matches)
      ? payload.matches
      : Array.isArray(payload.candidates)
        ? payload.candidates
        : [];

    const isAmbiguous = ambiguousCode === 'ambiguous' && rawCandidates.length > 0;
    if (!isAmbiguous) return null;

    let candidates = rawCandidates
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const roomName = c.room_name || c.roomName || null;
        const deviceName = c.device_name || c.deviceName || null;
        const rawName = c.name || c.title || c.label || null;

        // For device ambiguity, c4-mcp often includes both `name` and `device_name`.
        // Prefer `device_name` so the follow-up call can resolve by name reliably.
        const name = deviceName || rawName || roomName;

        return {
          name: name ? String(name) : null,
          label: null,
          room_id: c.room_id !== undefined ? this._asIntOrNull(c.room_id) : null,
          room_name: roomName ? String(roomName) : null,
          device_name: deviceName ? String(deviceName) : null,
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

    if (kind === 'device') {
      // Make device choices readable in the UI without breaking follow-up resolution.
      // Frontend should display `label` when present, while `name` remains the actual device name.
      candidates = candidates.map((c) => {
        const room = c && c.room_name ? String(c.room_name) : '';
        const nm = c && c.name ? String(c.name) : '';
        const label = (room && nm) ? `${room} — ${nm}` : null;
        return {
          ...c,
          label,
        };
      });

      // Reduce noisy partial matches (common for media searches: "TV", "Plex", etc.).
      // Keep this conservative: only filter when we have a query.
      if (query && typeof query === 'string') {
        const q = query.trim().toLowerCase();
        const strong = candidates.filter((c) => {
          const nameLower = (c && c.name ? String(c.name) : '').toLowerCase();
          const deviceLower = (c && c.device_name ? String(c.device_name) : '').toLowerCase();
          const score = (c && c.score !== null && c.score !== undefined) ? Number(c.score) : null;

          // If score isn't available, don't filter it out.
          if (!Number.isFinite(score)) return true;

          return nameLower === q || deviceLower === q || score >= 80;
        });
        if (strong.length > 0) candidates = strong;
      }

      candidates = candidates.slice(0, 12);
    }

    const message = (() => {
      if (innerDetailsObj && typeof innerDetailsObj === 'object' && innerDetailsObj.details) return innerDetailsObj.details;
      if (typeof inner.details === 'string' && inner.details.trim()) return inner.details.trim();
      const innerErr = inner && typeof inner === 'object' ? String(inner.error || '') : '';
      if (innerErr.toLowerCase() === 'ambiguous') return 'Multiple matches found';
      return innerErr || 'Multiple matches found';
    })();

    return {
      kind,
      query,
      message,
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
    args.include_candidates = true;

    if (tool === 'c4_room_presence_report') {
      // Presence is a read/resolve tool; disambiguate by supplying a deterministic room identifier.
      // Prefer room_id when available.
      if (choice.room_id !== null && choice.room_id !== undefined) {
        args.room_id = this._asIntOrNull(choice.room_id);
        // Keep room_name only for display/debug when available.
        if (choice.name) args.room_name = String(choice.name);
      } else if (choice.name) {
        args.room_name = String(choice.name);
        delete args.room_id;
      }
      return { tool, args };
    }

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

    if (tool === 'c4_tv_watch') {
      // c4-mcp contract: room_id is required; source_device_id is required.
      // We expect the clarification choice to carry device_id and name.
      if (choice.device_id) {
        args.source_device_id = String(choice.device_id);
      }
      // Keep room_id as provided on the original intent.
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
      // Only apply when the choice represents a device/source candidate (not a room).
      if (choice.device_id && choice.name) {
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
      'c4_media_remote',
      'c4_media_remote_last',
      'c4_media_watch_launch_app',
      'c4_media_watch_launch_app_by_name',
      'c4_scene_activate_by_name',
      'c4_scene_set_state_by_name',
      'c4_room_listen_by_name',
      'c4_list_rooms',
      'c4_find_rooms',
      // Read-only inventory/state tools used for follow-up memory validation.
      'c4_list_devices',
      'c4_find_devices',
      'c4_resolve_device',
      'c4_light_get_state',
      'c4_light_get_level',
      'c4_room_watch_status',
      'c4_room_listen_status',
      'c4_room_now_playing',
      'c4_room_presence_report',
      'c4_room_list_video_devices',
      'c4_room_select_video_device',
      'c4_room_select_audio_device',
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
      const args = this._normalizeArgsForTool(toolName, intent.args);

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
