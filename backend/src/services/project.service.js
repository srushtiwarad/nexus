// nexus/backend/src/services/project.service.js
const { query } = require('../config/database');

async function getProjectMembership(projectId, userId) {
  const result = await query(
    'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, userId]
  );
  return result.rows[0] || null;
}

module.exports = { getProjectMembership };
