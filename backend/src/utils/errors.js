const { v4: uuidv4 } = require('uuid');

/**
 * Custom error class with structured error codes
 */
class AppError extends Error {
  constructor(code, message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Error codes
 */
const ErrorCodes = {
  // User input errors (4xx)
  USER_INPUT_ERROR: 'USER_INPUT_ERROR',
  INVALID_AUDIO_FORMAT: 'INVALID_AUDIO_FORMAT',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // External service errors (5xx)
  STT_TIMEOUT: 'STT_TIMEOUT',
  STT_ERROR: 'STT_ERROR',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_ERROR: 'LLM_ERROR',
  MCP_CONNECTION_ERROR: 'MCP_CONNECTION_ERROR',
  MCP_COMMAND_ERROR: 'MCP_COMMAND_ERROR',

  // Internal errors (5xx)
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  WEBSOCKET_ERROR: 'WEBSOCKET_ERROR',
};

/**
 * Generate correlation ID for request tracking
 */
function generateCorrelationId() {
  return uuidv4();
}

/**
 * Add correlation ID to request
 */
function correlationMiddleware(req, res, next) {
  req.correlationId = generateCorrelationId();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
}

module.exports = {
  AppError,
  ErrorCodes,
  generateCorrelationId,
  correlationMiddleware,
};
