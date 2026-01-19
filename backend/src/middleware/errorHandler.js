const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, _next) {
  const correlationId = req.correlationId || 'unknown';

  // Log error
  logger.error('Request error', {
    correlationId,
    error: err.message,
    stack: err.stack,
    code: err.code || 'UNHANDLED_ERROR',
    statusCode: err.statusCode || 500,
  });

  // Handle AppError instances
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle unexpected errors
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      correlationId,
    },
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      correlationId: req.correlationId,
    },
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
