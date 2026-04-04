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
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
       WHERE p.created_by = ? OR pm.user_id = ?
       ORDER BY p.updated_at DESC`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
}

async function getProject(req, res, next) {
  try {
    const result = await query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
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
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [id, name, description || null, color || '#6366f1', startDate || null, dueDate || null, req.user.id]
    );
    const result = await query('SELECT * FROM projects WHERE id = ?', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

async function updateProject(req, res, next) {
  try {
    const { name, description, color, status, dueDate } = req.body;
    await query(
      `UPDATE projects SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        color = COALESCE(?, color),
        status = COALESCE(?, status),
        due_date = COALESCE(?, due_date)
       WHERE id = ? AND created_by = ?`,
      [name||null, description||null, color||null, status||null, dueDate||null, req.params.id, req.user.id]
    );
    const result = await query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function deleteProject(req, res, next) {
  try {
    await query('UPDATE projects SET status = ? WHERE id = ? AND created_by = ?', ['deleted', req.params.id, req.user.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) { next(err); }
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject };
