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

      const validPriority = ['low', 'medium', 'high'];
      if (!validPriority.includes(priority)) {
        return next(new AppError('Invalid priority', 422));
      }

      await query(
        `INSERT INTO tasks (id, project_id, title, priority, status)
         VALUES (UUID(), ?, ?, ?, ?)`,
        [projectId, title, priority, status]
      );

      const task = await query(
        `SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
        [projectId]
      );

      res.status(201).json(task.rows[0]);
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

      if (!projectId.match(/^[0-9a-fA-F-]{36}$/)) {
        return next(new AppError('Invalid project ID', 400));
      }

      let sql = `SELECT * FROM tasks WHERE project_id = ?`;
      const params = [projectId];

      if (status) {
        sql += ` AND status = ?`;
        params.push(status);
      }

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
        `SELECT * FROM tasks WHERE id = ?`,
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

      const allowedFields = ['title', 'status', 'priority'];
      const fields = Object.keys(updates).filter(f => allowedFields.includes(f));

      if (fields.length === 0) {
        return next(new AppError('No valid fields provided', 400));
      }

      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => updates[f]);

      await query(
        `UPDATE tasks SET ${setClause} WHERE id = ?`,
        [...values, taskId]
      );

      const updated = await query(
        `SELECT * FROM tasks WHERE id = ?`,
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
        `UPDATE tasks SET status = 'cancelled' WHERE id = ?`,
        [taskId]
      );

      res.json({ message: 'Task cancelled' });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;