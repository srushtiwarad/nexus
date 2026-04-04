// ============================================================
// nexus/backend/src/middleware/sanitize.js
// CUSTOM SECURITY LAYER — XSS, SQL injection, and prototype
// pollution prevention applied to all incoming request data.
// ============================================================
const xss = require('xss');
const { AppError } = require('./errorHandler');

// Characters that could indicate SQL injection attempts
const SQL_INJECTION_PATTERN = /('|--|;|\/\*|\*\/|xp_|EXEC\s|UNION\s+SELECT|DROP\s+TABLE)/i;

// Paths that carry SQL-like content legitimately (e.g. code snippets)
const EXEMPT_PATHS = ['/api/v1/tasks/description'];

// ── Deep-sanitize an object recursively ───────────────────────
function deepSanitize(obj, depth = 0) {
  if (depth > 10) return obj; // prevent infinite recursion on deep nesting
  if (typeof obj === 'string') return xss(obj.trim());
  if (Array.isArray(obj)) return obj.map((item) => deepSanitize(item, depth + 1));
  if (obj !== null && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      // Prototype pollution guard
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      clean[k] = deepSanitize(v, depth + 1);
    }
    return clean;
  }
  return obj;
}

// ── SQL injection heuristic scan ──────────────────────────────
function hasSQLInjection(obj) {
  if (typeof obj === 'string') return SQL_INJECTION_PATTERN.test(obj);
  if (Array.isArray(obj)) return obj.some(hasSQLInjection);
  if (obj && typeof obj === 'object') return Object.values(obj).some(hasSQLInjection);
  return false;
}

// ── Sanitize middleware ───────────────────────────────────────
function sanitizeInputs(req, res, next) {
  try {
    const isExempt = EXEMPT_PATHS.some((p) => req.path.startsWith(p));

    if (req.body && typeof req.body === 'object') {
      if (!isExempt && hasSQLInjection(req.body)) {
        throw new AppError('Request contains potentially malicious content', 400);
      }
      req.body = deepSanitize(req.body);
    }

    if (req.query && typeof req.query === 'object') {
      req.query = deepSanitize(req.query);
    }

    if (req.params && typeof req.params === 'object') {
      req.params = deepSanitize(req.params);
    }

    next();
  } catch (err) {
    next(err);
  }
}

// ── Validate UUID param helper ────────────────────────────────
function validateUUID(paramName) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return (req, res, next) => {
    const val = req.params[paramName];
    if (val && !UUID_RE.test(val)) {
      return next(new AppError(`Invalid ${paramName} format`, 400));
    }
    next();
  };
}

module.exports = { sanitizeInputs, deepSanitize, validateUUID };
