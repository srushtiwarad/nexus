// ============================================================
// nexus/backend/src/routes/task.routes.js
// ============================================================

const express = require('express');
const router = express.Router();

const { authenticate, requireProjectMembership } = require('../middleware/auth.middleware');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

// ================= CREATE TASK =================
router.post('/:pid/tasks',
  authenticate,
  requireProjectMembership,
  async (req, res, next) => {
    try {
      const { title, priority = 'medium', status = 'todo' } = req.body;
      const projectId = req.params.pid;

      if (!title) return next(new AppError('Title is required', 422));

      const validPriority = ['low', 'medium', 'high', 'critical'];
      if (!validPriority.includes(priority)) {
        return next(new AppError('Invalid priority', 422));
      }

      const result = await query(
        `INSERT INTO tasks (id, project_id, title, priority, status, reporter_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING *`,
        [projectId, title, priority, status, req.user.id]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// ================= GET ALL TASKS =================
router.get('/:pid/tasks',
  authenticate,
  requireProjectMembership,
  async (req, res, next) => {
    try {
      const projectId = req.params.pid;
      const { status } = req.query;

      let sql = `SELECT * FROM tasks WHERE project_id = $1`;
      const params = [projectId];

      if (status) {
        sql += ` AND status = $2`;
        params.push(status);
      }

      sql += ` ORDER BY created_at DESC`;

      const result = await query(sql, params);

      res.json({
        data: result.rows,
        pagination: {
          total: result.rows.length
        }
      });

    } catch (err) {
      next(err);
    }
  }
);

// ================= GET SINGLE TASK =================
router.get('/:pid/tasks/:taskId',
  authenticate,
  requireProjectMembership,
  async (req, res, next) => {
    try {
      const { taskId } = req.params;

      const result = await query(
        `SELECT * FROM tasks WHERE id = $1`,
        [taskId]
      );

      if (result.rows.length === 0) {
        return next(new AppError('Task not found', 404));
      }

      res.json(result.rows[0]);

    } catch (err) {
      next(err);
    }
  }
);

// ================= UPDATE TASK =================
router.patch('/:pid/tasks/:taskId',
  authenticate,
  requireProjectMembership,
  async (req, res, next) => {
    try {
      const { taskId } = req.params;
      const updates = req.body;

      const allowedFields = ['title', 'status', 'priority', 'description', 'assignee_id', 'due_date'];
      const fields = Object.keys(updates).filter(f => allowedFields.includes(f));

      if (fields.length === 0) {
        return next(new AppError('No valid fields provided', 400));
      }

      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
      const values = fields.map(f => updates[f]);

      await query(
        `UPDATE tasks SET ${setClause} WHERE id = $${fields.length + 1}`,
        [...values, taskId]
      );

      const updated = await query(
        `SELECT * FROM tasks WHERE id = $1`,
        [taskId]
      );

      res.json(updated.rows[0]);

    } catch (err) {
      next(err);
    }
  }
);

// ================= DELETE (SOFT) =================
router.delete('/:pid/tasks/:taskId',
  authenticate,
  requireProjectMembership,
  async (req, res, next) => {
    try {
      const { taskId } = req.params;

      await query(
        `UPDATE tasks SET status = 'cancelled' WHERE id = $1`,
        [taskId]
      );

      res.json({ message: 'Task cancelled' });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;