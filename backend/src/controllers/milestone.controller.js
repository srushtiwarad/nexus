const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function ensureMilestonesTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS project_milestones (
      id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
      project_id  CHAR(36)     NOT NULL,
      title       VARCHAR(255) NOT NULL,
      due_date    DATE         NOT NULL,
      created_by  CHAR(36)     NOT NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_milestones_project (project_id),
      INDEX idx_milestones_due (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );
}

async function requireProjectAccess(projectId, userId) {
  const result = await query(
    `
    SELECT p.id
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.id = ? AND (p.created_by = ? OR pm.user_id = ?)
    LIMIT 1
    `,
    [userId, projectId, userId, userId]
  );
  if (!result.rows?.length) throw new AppError('Project not found', 404);
}

async function listMilestones(req, res, next) {
  try {
    await ensureMilestonesTable();
    const { projectId } = req.params;
    await requireProjectAccess(projectId, req.user.id);

    const result = await query(
      `
      SELECT id, project_id, title, due_date, created_by, created_at, updated_at
      FROM project_milestones
      WHERE project_id = ?
      ORDER BY due_date ASC
      `,
      [projectId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function createMilestone(req, res, next) {
  try {
    await ensureMilestonesTable();
    const { projectId } = req.params;
    const { title, dueDate } = req.body;
    if (!title?.trim()) throw new AppError('Title required', 400);
    if (!dueDate) throw new AppError('Due date required', 400);

    await requireProjectAccess(projectId, req.user.id);

    const id = uuidv4();
    await query(
      `
      INSERT INTO project_milestones (id, project_id, title, due_date, created_by)
      VALUES (?, ?, ?, ?, ?)
      `,
      [id, projectId, title.trim(), dueDate, req.user.id]
    );
    const result = await query('SELECT * FROM project_milestones WHERE id = ?', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateMilestone(req, res, next) {
  try {
    await ensureMilestonesTable();
    const { projectId, milestoneId } = req.params;
    const { title, dueDate } = req.body;
    await requireProjectAccess(projectId, req.user.id);

    const exists = await query('SELECT id FROM project_milestones WHERE id = ? AND project_id = ?', [milestoneId, projectId]);
    if (!exists.rows?.length) throw new AppError('Milestone not found', 404);

    await query(
      `
      UPDATE project_milestones SET
        title = COALESCE(?, title),
        due_date = COALESCE(?, due_date)
      WHERE id = ? AND project_id = ?
      `,
      [title?.trim() || null, dueDate || null, milestoneId, projectId]
    );
    const result = await query('SELECT * FROM project_milestones WHERE id = ?', [milestoneId]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteMilestone(req, res, next) {
  try {
    await ensureMilestonesTable();
    const { projectId, milestoneId } = req.params;
    await requireProjectAccess(projectId, req.user.id);
    await query('DELETE FROM project_milestones WHERE id = ? AND project_id = ?', [milestoneId, projectId]);
    res.json({ message: 'Milestone deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
};

