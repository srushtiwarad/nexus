// ============================================================
// nexus/backend/src/controllers/task.controller.js  (MySQL)
// ============================================================
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function listTasks(req, res, next) {
  try {
    const { status, assignee } = req.query;
    let sql = `SELECT t.*, u.full_name as assignee_name, u.email as assignee_email
               FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
               WHERE t.project_id = ?`;
    const params = [req.params.projectId];
    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (assignee) { sql += ' AND t.assignee_id = ?'; params.push(assignee); }
    sql += ' ORDER BY t.position ASC, t.created_at ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
}

async function getTask(req, res, next) {
  try {
    const result = await query(
      `SELECT t.*, u.full_name as assignee_name FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.id = ? AND t.project_id = ?`,
      [req.params.taskId, req.params.projectId]
    );
    if (!result.rows[0]) throw new AppError('Task not found', 404);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function createTask(req, res, next) {
  try {
    const { title, description, status, priority, assigneeId, dueDate, estimatedHrs, tags } = req.body;
    if (!title) throw new AppError('Task title required', 400);
    const id = uuidv4();
    await query(
      `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, reporter_id, due_date, estimated_hrs, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.projectId, title, description||null, status||'todo', priority||'medium',
       assigneeId||null, req.user.id, dueDate||null, estimatedHrs||null, tags ? JSON.stringify(tags) : null]
    );
    const result = await query('SELECT * FROM tasks WHERE id = ?', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

async function updateTask(req, res, next) {
  try {
    const { title, description, status, priority, assigneeId, dueDate, actualHrs } = req.body;
    await query(
      `UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        assignee_id = COALESCE(?, assignee_id),
        due_date = COALESCE(?, due_date),
        actual_hrs = COALESCE(?, actual_hrs)
       WHERE id = ? AND project_id = ?`,
      [title||null, description||null, status||null, priority||null,
       assigneeId||null, dueDate||null, actualHrs||null,
       req.params.taskId, req.params.projectId]
    );
    const result = await query('SELECT * FROM tasks WHERE id = ?', [req.params.taskId]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function deleteTask(req, res, next) {
  try {
    await query('DELETE FROM tasks WHERE id = ? AND project_id = ?', [req.params.taskId, req.params.projectId]);
    res.json({ message: 'Task deleted' });
  } catch (err) { next(err); }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };
