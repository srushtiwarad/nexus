// ============================================================
// nexus/backend/src/controllers/audit.controller.js
// Audit logs API (MySQL)
// ============================================================

const { query } = require('../config/database');

function tryParseJson(value) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function getLogs(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const isAdmin = req.user?.role === 'admin';

    let sql = `
      SELECT
        al.*,
        u.full_name AS user_name,
        u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE 1 = 1
    `;
    const params = [];

    // Non-admin users can only view their own audit records.
    if (!isAdmin) {
      sql += ' AND al.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await query(sql, params);

    const rows = result.rows.map((r) => ({
      ...r,
      meta: tryParseJson(r.meta),
    }));

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLogs };

