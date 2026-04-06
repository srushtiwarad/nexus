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
               WHERE t.project_id = $1`;
    const params = [req.params.projectId];
    let idx = 2;
    if (status) { 
      sql += ` AND t.status = $${idx++}`; 
      params.push(status); 
    }
    if (assignee) { 
      sql += ` AND t.assignee_id = $${idx++}`; 
      params.push(assignee); 
    }
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
       WHERE t.id = $1 AND t.project_id = $2`,
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, req.params.projectId, title, description||null, status||'todo', priority||'medium',
       assigneeId||null, req.user.id, dueDate||null, estimatedHrs||null, tags || []]
    );
    const result = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
}

async function updateTask(req, res, next) {
  try {
    const { title, description, status, priority, assigneeId, dueDate, actualHrs } = req.body;
    // Note: COALESCE(?, col) in MySQL works slightly differently than in PG if we want to skip update.
    // But here it seems they use it to allow partial updates.
    await query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assignee_id = COALESCE($5, assignee_id),
        due_date = COALESCE($6, due_date),
        actual_hrs = COALESCE($7, actual_hrs),
        updated_at = NOW()
       WHERE id = $8 AND project_id = $9`,
      [title||null, description||null, status||null, priority||null,
       assigneeId||null, dueDate||null, actualHrs||null,
       req.params.taskId, req.params.projectId]
    );
    const result = await query('SELECT * FROM tasks WHERE id = $1', [req.params.taskId]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

async function deleteTask(req, res, next) {
  try {
    await query('DELETE FROM tasks WHERE id = $1 AND project_id = $2', [req.params.taskId, req.params.projectId]);
    res.json({ message: 'Task deleted' });
  } catch (err) { next(err); }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask };
