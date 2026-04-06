// ============================================================
// nexus/backend/src/controllers/project.controller.js
// MySQL version - UUID() for IDs, ? placeholders
// ============================================================
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function listProjects(req, res, next) {
  try {
    const result = await query(
      `SELECT p.* FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.created_by = $2 OR pm.user_id = $3
       ORDER BY p.updated_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
}

async function getProject(req, res, next) {
  try {
    const result = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) throw new AppError('Project not found', 404);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function createProject(req, res, next) {
  try {
    const { name, description, color, startDate, dueDate } = req.body;
    if (!name) throw new AppError('Project name required', 400);
    const id = uuidv4();
    await query(
      `INSERT INTO projects (id, name, description, color, start_date, due_date, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
      [id, name, description || null, color || '#6366f1', startDate || null, dueDate || null, req.user.id]
    );
    const result = await query('SELECT * FROM projects WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

async function updateProject(req, res, next) {
  try {
    const { name, description, color, status, dueDate } = req.body;
    await query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        status = COALESCE($4, status),
        due_date = COALESCE($5, due_date),
        updated_at = NOW()
       WHERE id = $6 AND created_by = $7`,
      [name||null, description||null, color||null, status||null, dueDate||null, req.params.id, req.user.id]
    );
    const result = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function deleteProject(req, res, next) {
  try {
    await query('UPDATE projects SET status = $1 WHERE id = $2 AND created_by = $3', ['deleted', req.params.id, req.user.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) { next(err); }
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject };
