// nexus/backend/src/services/user.service.js
const { query } = require('../config/database');

async function getUserById(id) {
  const result = await query(
    'SELECT id, email, full_name, role, avatar_url, is_suspended FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { getUserById };
