// ============================================================
// nexus/backend/src/controllers/comment.controller.js
// CRUD for task comments with mention parsing.
// ============================================================
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { broadcastToProject } = require('../services/websocket.service');
const { notifyCommentAdded } = require('../services/notification.service');

const MENTION_RE = /@\[([^\]]+)\]\(([a-f0-9-]{36})\)/g;

// ── List comments for a task ──────────────────────────────────
async function listComments(req, res, next) {
  try {
    const { taskId } = req.params;
    const result = await query(`
      SELECT c.*, u.full_name AS author_name, u.avatar_url AS author_avatar
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.task_id = $1
      ORDER BY c.created_at ASC
    `, [taskId]);
    res.json(result.rows);
  } catch (err) { next(err); }
}

// ── Create comment ────────────────────────────────────────────
async function createComment(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new AppError('Validation failed', 422));

    const { taskId, projectId } = req.params;
    const { body: commentBody } = req.body;

    const result = await query(`
      INSERT INTO comments (task_id, author_id, body)
      VALUES ($1, $2, $3)
      RETURNING *, (SELECT full_name FROM users WHERE id = $2) AS author_name
    `, [taskId, req.user.id, commentBody]);

    const comment = result.rows[0];

    // Broadcast to project room
    broadcastToProject(projectId, {
      type: 'comment:created',
      taskId,
      comment,
    });

    // Notify task assignee and reporter (if different from commenter)
    const taskResult = await query(
      'SELECT assignee_id, reporter_id, title FROM tasks WHERE id = $1',
      [taskId]
    );
    const task = taskResult.rows[0];
    const recipients = new Set([task.assignee_id, task.reporter_id].filter(Boolean));
    recipients.delete(req.user.id); // don't notify yourself

    await Promise.all(
      [...recipients].map(recipientId =>
        notifyCommentAdded({
          task: { ...task, id: taskId, project_id: projectId },
          commentAuthorName: req.user.full_name,
          recipientId,
        })
      )
    );

    // Parse @mentions from the comment body
    const mentions = [...commentBody.matchAll(MENTION_RE)].map(m => m[2]);
    const mentionRecipients = mentions.filter(id => !recipients.has(id) && id !== req.user.id);
    // Notify mentioned users (fire-and-forget)
    mentionRecipients.forEach(userId => {
      const { createNotification, NOTIF_TYPES } = require('../services/notification.service');
      createNotification({
        userId,
        type: NOTIF_TYPES.MENTION,
        title: `${req.user.full_name} mentioned you in a comment`,
        link: `/dashboard/projects/${projectId}?task=${taskId}`,
      });
    });

    res.status(201).json(comment);
  } catch (err) { next(err); }
}

// ── Update comment (author only) ──────────────────────────────
async function updateComment(req, res, next) {
  try {
    const { commentId } = req.params;
    const { body: newBody } = req.body;
    if (!newBody?.trim()) throw new AppError('Comment body required', 400);

    const result = await query(`
      UPDATE comments
      SET body = $1, edited_at = NOW()
      WHERE id = $2 AND author_id = $3
      RETURNING *
    `, [newBody, commentId, req.user.id]);

    if (!result.rows.length) throw new AppError('Comment not found or not yours', 404);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
}

// ── Delete comment (author or project admin) ──────────────────
async function deleteComment(req, res, next) {
  try {
    const { commentId } = req.params;
    const isAdmin = ['admin', 'owner'].includes(req.projectRole);

    const condition = isAdmin
      ? 'id = $1'
      : 'id = $1 AND author_id = $2';
    const params = isAdmin ? [commentId] : [commentId, req.user.id];

    const result = await query(`DELETE FROM comments WHERE ${condition} RETURNING id`, params);
    if (!result.rows.length) throw new AppError('Comment not found', 404);
    res.json({ message: 'Comment deleted' });
  } catch (err) { next(err); }
}

const createCommentValidators = [
  body('body').trim().isLength({ min: 1, max: 10000 }),
];

module.exports = { listComments, createComment, updateComment, deleteComment, createCommentValidators };
