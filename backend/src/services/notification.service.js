// ============================================================
// nexus/backend/src/services/notification.service.js
// Creates DB notifications and pushes real-time WS events.
// Can optionally dispatch emails via nodemailer.
// ============================================================
const { query } = require('../config/database');
const { pushToUser } = require('./websocket.service');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Valid notification types mirror the PostgreSQL ENUM
const NOTIF_TYPES = {
  TASK_ASSIGNED:  'task_assigned',
  TASK_DUE:       'task_due',
  COMMENT_ADDED:  'comment_added',
  MENTION:        'mention',
  PROJECT_INVITE: 'project_invite',
  STATUS_CHANGE:  'status_change',
};

/**
 * Create a notification record and push via WebSocket.
 * @param {object} opts
 * @param {string} opts.userId       - recipient user ID
 * @param {string} opts.type         - one of NOTIF_TYPES values
 * @param {string} opts.title        - short notification title
 * @param {string} [opts.body]       - longer body text
 * @param {string} [opts.link]       - deep-link path e.g. /dashboard/projects/:id
 */
async function createNotification({ userId, type, title, body = null, link = null }) {
  try {
    const id = uuidv4();
    await query(
      `
      INSERT INTO notifications (id, user_id, type, title, body, link, is_read)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE)
      `,
      [id, userId, type, title, body, link]
    );

    const result = await query('SELECT * FROM notifications WHERE id = $1', [id]);
    const notification = result.rows[0];

    // Push real-time WS event to the user if they're connected
    pushToUser(userId, { type: 'notification', data: notification });

    return notification;
  } catch (err) {
    logger.error('Failed to create notification:', err.message);
    return null;
  }
}

// ── Domain-specific helpers ───────────────────────────────────

async function notifyTaskAssigned({ task, assigneeId, assignerName }) {
  return createNotification({
    userId: assigneeId,
    type: NOTIF_TYPES.TASK_ASSIGNED,
    title: `You were assigned "${task.title}"`,
    body: `${assignerName} assigned this task to you`,
    link: `/dashboard/projects/${task.project_id}?task=${task.id}`,
  });
}

async function notifyStatusChange({ task, changedByName, recipientId }) {
  return createNotification({
    userId: recipientId,
    type: NOTIF_TYPES.STATUS_CHANGE,
    title: `Task "${task.title}" moved to ${task.status.replace('_', ' ')}`,
    body: `Updated by ${changedByName}`,
    link: `/dashboard/projects/${task.project_id}?task=${task.id}`,
  });
}

async function notifyStatusChangeMany({ task, changedByName, recipientIds }) {
  // Logic for many recipients if needed
}

async function notifyCommentAdded({ task, commentAuthorName, recipientId }) {
  return createNotification({
    userId: recipientId,
    type: NOTIF_TYPES.COMMENT_ADDED,
    title: `New comment on "${task.title}"`,
    body: `${commentAuthorName} left a comment`,
    link: `/dashboard/projects/${task.project_id}?task=${task.id}`,
  });
}

async function notifyProjectInvite({ projectName, inviterName, recipientId, projectId }) {
  return createNotification({
    userId: recipientId,
    type: NOTIF_TYPES.PROJECT_INVITE,
    title: `You were added to "${projectName}"`,
    body: `${inviterName} added you as a project member`,
    link: `/dashboard/projects/${projectId}`,
  });
}

// ── Fetch unread notifications for a user ─────────────────────
async function getUnreadNotifications(userId, limit = 20) {
  const result = await query(`
    SELECT * FROM notifications
    WHERE user_id = $1 AND is_read = FALSE
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, parseInt(limit, 10) || 20]);
  return result.rows;
}

// ── Mark notifications as read ────────────────────────────────
async function markAsRead(userId, notificationIds) {
  if (!notificationIds?.length) {
    // Mark all
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [userId]);
  } else {
    // Standard approach for dynamic IN clause in pg
    const result = await query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, notificationIds]
    );
  }
}

module.exports = {
  NOTIF_TYPES,
  createNotification,
  notifyTaskAssigned,
  notifyStatusChange,
  notifyCommentAdded,
  notifyProjectInvite,
  getUnreadNotifications,
  markAsRead,
};
