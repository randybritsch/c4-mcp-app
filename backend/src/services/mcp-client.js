const net = require('net');
const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

class MCPClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Connect to Control4 Director via MCP
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.client = new net.Socket();

      this.client.connect(config.control4.port, config.control4.host, () => {
        this.connected = true;
        logger.info('MCP client connected', {
          host: config.control4.host,
          port: config.control4.port,
        });
        resolve();
      });

      this.client.on('error', (error) => {
        this.connected = false;
        logger.error('MCP connection error', { error: error.message });
        reject(error);
      });

      this.client.on('close', () => {
        this.connected = false;
        logger.info('MCP connection closed');
      });
    });
  }

  /**
   * Send command to Control4 via MCP
   */
  async sendCommand(intent, correlationId) {
    if (!this.connected) {
      try {
        await this.connect();
      } catch (error) {
        throw new AppError(
          ErrorCodes.MCP_CONNECTION_ERROR,
          `Failed to connect to Control4: ${error.message}`,
          500
        );
      }
    }

    return new Promise((resolve, reject) => {
      // Build MCP command from intent
      const mcpCommand = this.buildMCPCommand(intent);

      logger.info('Sending MCP command', {
        correlationId,
        intent,
        command: mcpCommand,
      });

      // Send command
      this.client.write(mcpCommand);

      // Wait for response
      const timeout = setTimeout(() => {
        reject(new AppError(
          ErrorCodes.MCP_COMMAND_ERROR,
          'Command timeout',
          500
        ));
      }, 5000);

      this.client.once('data', (data) => {
        clearTimeout(timeout);
        const response = data.toString();

        logger.info('MCP response received', {
          correlationId,
          response,
        });

        resolve({
          success: true,
          response,
          timestamp: new Date().toISOString(),
        });
      });
    });
  }

  /**
   * Build MCP command string from intent
   * This is a placeholder - actual MCP protocol would depend on Control4 spec
   */
  buildMCPCommand(intent) {
    const { action, target, value, room } = intent;

    // Example MCP command format (adjust based on actual Control4 MCP protocol)
    const command = {
      action,
      target,
      value,
      room,
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(command);
  }

  /**
   * Disconnect from Control4
   */
  disconnect() {
    if (this.client) {
      this.client.destroy();
      this.connected = false;
      logger.info('MCP client disconnected');
    }
  }
}

// Singleton instance
const mcpClient = new MCPClient();

module.exports = mcpClient;
