const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

class MCPClient {
  constructor() {
    this._toolAllowlist = null;
  }

  _baseUrl() {
    const raw = config.control4.mcpBaseUrl;
    if (!raw || typeof raw !== 'string') {
      throw new AppError(
        ErrorCodes.MCP_CONNECTION_ERROR,
        'C4_MCP_BASE_URL is not configured',
        500
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
      'c4_scene_activate_by_name',
      'c4_scene_set_state_by_name',
      'c4_list_rooms',
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
        { tool: toolName }
      );
    }
  }

  async _fetchJson(url, options, correlationId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this._timeoutMs());

    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options && options.headers ? options.headers : {}),
          'Content-Type': 'application/json',
        },
      });

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
          { correlationId, url, status: resp.status, body: json }
        );
      }

      return json;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new AppError(
          ErrorCodes.MCP_COMMAND_ERROR,
          'MCP request timeout',
          504,
          { correlationId, url, timeoutMs: this._timeoutMs() }
        );
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCodes.MCP_CONNECTION_ERROR,
        `Failed to reach MCP server: ${error.message}`,
        502,
        { correlationId, url }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async listTools(correlationId) {
    const url = `${this._baseUrl()}/mcp/list`;
    return this._fetchJson(url, { method: 'GET' }, correlationId);
  }

  async callTool(toolName, args, correlationId) {
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
      correlationId
    );
  }

  /**
   * Send command to Control4 via MCP
   */
  async sendCommand(intent, correlationId) {
    if (!intent || typeof intent !== 'object') {
      throw new AppError(
        ErrorCodes.USER_INPUT_ERROR,
        'Invalid intent',
        400
      );
    }

    // Preferred shape: { tool: "c4_room_lights_set", args: {...} }
    if (intent.tool && intent.args) {
      const toolName = String(intent.tool);
      const args = intent.args;

      logger.info('Sending MCP tool call', {
        correlationId,
        tool: toolName,
        args,
      });

      const result = await this.callTool(toolName, args, correlationId);
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

    const result = await this.callTool(translated.tool, translated.args, correlationId);
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
          400
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
            400
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
          400
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
      { intent }
    );
  }
}

// Singleton instance
const mcpClient = new MCPClient();

module.exports = mcpClient;
