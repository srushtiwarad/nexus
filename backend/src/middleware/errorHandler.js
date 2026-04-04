// ============================================================
// nexus/backend/src/middleware/errorHandler.js
// Centralised error handling — distinguishes operational errors
// from programming errors, never leaks stack traces to clients.
// ============================================================
const logger = require('../utils/logger');

// Structured application error
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── 404 handler ───────────────────────────────────────────────
function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
  });
}

// ── Global error handler ─────────────────────────────────────
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  // Log all errors, but at appropriate levels
  if (statusCode >= 500) {
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    logger.warn({ message: err.message, path: req.path, userId: req.user?.id });
  }

  const response = {
    error: err.isOperational ? err.message : 'Internal server error',
    statusCode,
    ...(err.code && { code: err.code }),
    ...(err.errors && { errors: err.errors }),
    // Never expose stack in production
    ...(!isProd && statusCode >= 500 && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
}

module.exports = { AppError, notFoundHandler, errorHandler };
