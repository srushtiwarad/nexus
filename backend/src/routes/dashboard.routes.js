// nexus/backend/src/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { query } = require('../config/database');
const { getUnreadNotifications } = require('../services/notification.service');

router.use(authenticate);

// GET /api/v1/dashboard/summary
router.get('/summary', async (req, res, next) => {
  try {
    // Ensure milestones table exists (dev convenience)
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS project_milestones (
          id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id  UUID         NOT NULL,
          title       VARCHAR(255) NOT NULL,
          due_date    DATE         NOT NULL,
          created_by  UUID         NOT NULL,
          created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )`
      );
    } catch {
      // best-effort
    }

    const userId = req.user.id;

    // Projects user can access (created_by OR project_members)
    // Note: MySQL ? placeholders - each ? consumes next param
    const projectsResult = await query(
      `
      SELECT DISTINCT p.*
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      WHERE (p.created_by = $2 OR pm.user_id = $3)
        AND p.status = 'active'
      ORDER BY p.updated_at DESC
      `,
      [userId, userId, userId]
    );

    const projects = projectsResult.rows || [];
    const projectIds = projects.map((p) => p.id);

    // Notifications (unread)
    const notifications = await getUnreadNotifications(userId, 20);

    // No projects => return minimal payload
    if (projectIds.length === 0) {
      return res.json({
        projectHealth: {
          progressPct: 0,
          overdueCount: 0,
          blockersCount: 0,
          workload: { todo: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0 },
        },
        calendar: [],
        notifications,
        perProject: [],
      });
    }

    // Tasks across those projects
    const taskPlaceholders = projectIds.map((_, i) => `$${i + 1}`).join(',');
    const taskResult = await query(
      `
      SELECT
        t.id,
        t.project_id,
        t.title,
        t.status,
        t.priority,
        t.assignee_id,
        t.due_date
      FROM tasks t
      WHERE t.project_id IN (${taskPlaceholders})
      `,
      [...projectIds]
    );
    const tasks = taskResult.rows || [];

    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);

    const isDoneLike = (s) => s === 'done' || s === 'cancelled';
    const isOverdue = (t) => !!t.due_date && String(t.due_date).slice(0, 10) < todayISO && !isDoneLike(t.status);
    const isBlocker = (t) => t.priority === 'critical' && !isDoneLike(t.status);

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const overdueCount = tasks.filter(isOverdue).length;
    const blockersCount = tasks.filter(isBlocker).length;

    const workload = { todo: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0 };
    for (const t of tasks) {
      if (t.assignee_id === userId && workload[t.status] !== undefined) {
        workload[t.status] += 1;
      }
    }

    const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

    // Milestones
    let milestones = [];
    try {
      const milestonePlaceholders = projectIds.map((_, i) => `$${i + 1}`).join(',');
      const milestonesResult = await query(
        `
        SELECT id, project_id, title, due_date
        FROM project_milestones
        WHERE project_id IN (${milestonePlaceholders})
        ORDER BY due_date ASC
        `,
        [...projectIds]
      );
      milestones = milestonesResult.rows || [];
    } catch {
      milestones = [];
    }

    // Calendar events
    const calendar = [];
    for (const p of projects) {
      if (p.due_date) {
        calendar.push({
          type: 'project_due',
          date: String(p.due_date).slice(0, 10),
          title: `Project due: ${p.name}`,
          link: `/dashboard/projects/${p.id}`,
          color: p.color || '#6366f1',
        });
      }
    }
    for (const t of tasks) {
      if (t.due_date) {
        calendar.push({
          type: 'task_due',
          date: String(t.due_date).slice(0, 10),
          title: `Task due: ${t.title}`,
          link: `/dashboard/projects/${t.project_id}?task=${t.id}`,
        });
      }
    }
    for (const m of milestones) {
      calendar.push({
        type: 'milestone',
        date: String(m.due_date).slice(0, 10),
        title: `Milestone: ${m.title}`,
        link: `/dashboard/projects/${m.project_id}`,
      });
    }
    calendar.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // Per-project health (top 6)
    const perProjectMap = new Map();
    for (const p of projects) {
      perProjectMap.set(p.id, { projectId: p.id, name: p.name, color: p.color || '#6366f1', total: 0, done: 0, overdue: 0, blockers: 0 });
    }
    for (const t of tasks) {
      const row = perProjectMap.get(t.project_id);
      if (!row) continue;
      row.total += 1;
      if (t.status === 'done') row.done += 1;
      if (isOverdue(t)) row.overdue += 1;
      if (isBlocker(t)) row.blockers += 1;
    }
    const perProject = [...perProjectMap.values()]
      .map((r) => ({ ...r, progressPct: r.total === 0 ? 0 : Math.round((r.done / r.total) * 100) }))
      .sort((a, b) => (b.overdue + b.blockers) - (a.overdue + a.blockers))
      .slice(0, 6);

    res.json({
      projectHealth: { progressPct, overdueCount, blockersCount, workload },
      calendar,
      notifications,
      perProject,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
