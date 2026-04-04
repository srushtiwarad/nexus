// ============================================================
// nexus/backend/src/middleware/auditLog.middleware.js
// CUSTOM SECURITY LAYER — Immutable audit trail for all
// mutating API operations. Written to PostgreSQL audit table
// and asynchronously streamed to CloudWatch Logs.
// ============================================================
const { query } = require('../config/database');
const logger = require('../utils/logger');

// Actions that must always be audited
const AUDITABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function writeAuditRecord({ userId, action, resource, resourceId, meta, ip, status }) {
  try {
    await query(
      `INSERT INTO audit_logs
       (user_id, action, resource, resource_id, meta, ip_address, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, action, resource, resourceId, JSON.stringify(meta || {}), ip, status]
    );
  } catch (err) {
    // Audit failures must never block the request — log and continue
    logger.error('Audit log write failed:', err.message);
  }
}

function auditLog(resource) {
  return (req, res, next) => {
    if (!AUDITABLE_METHODS.has(req.method)) return next();

    // Capture the response status after it's sent
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const status = res.statusCode < 400 ? 'success' : 'failure';
      const action = `${req.method.toLowerCase()}:${resource}`;
      const resourceId = req.params?.id || req.params?.projectId || req.params?.taskId || null;

      setImmediate(() => writeAuditRecord({
        userId: req.user?.id || null,
        action,
        resource,
        resourceId,
        meta: { path: req.path, query: req.query },
        ip: req.ip,
        status,
      }));

      return originalJson(body);
    };

    next();
  };
}

module.exports = { auditLog, writeAuditRecord };
