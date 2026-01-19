const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        ErrorCodes.UNAUTHORIZED,
        'Missing or invalid authorization header',
        401
      );
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret);

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.error('JWT verification failed', {
        correlationId: req.correlationId,
        error: error.message,
      });
      return res.status(401).json({
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: 'Invalid or expired token',
        },
      });
    }
    next(error);
  }
}

/**
 * Generate JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiry,
  });
}

module.exports = {
  authMiddleware,
  generateToken,
};
