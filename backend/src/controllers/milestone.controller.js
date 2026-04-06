const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function requireProjectAccess(projectId, userId) {
  const result = await query(
    `
    SELECT p.id
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
    WHERE p.id = $2 AND (p.created_by = $3 OR pm.user_id = $4)
    LIMIT 1
    `,
    [userId, projectId, userId, userId]
  );
  if (!result.rows?.length) throw new AppError('Project not found', 404);
}

async function listMilestones(req, res, next) {
  try {
    const { projectId } = req.params;
    await requireProjectAccess(projectId, req.user.id);

    const result = await query(
      `
      SELECT id, project_id, title, due_date, created_by, created_at, updated_at
      FROM project_milestones
      WHERE project_id = $1
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
    const { projectId } = req.params;
    const { title, dueDate } = req.body;
    if (!title?.trim()) throw new AppError('Title required', 400);
    if (!dueDate) throw new AppError('Due date required', 400);

    await requireProjectAccess(projectId, req.user.id);

    const id = uuidv4();
    await query(
      `
      INSERT INTO project_milestones (id, project_id, title, due_date, created_by)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [id, projectId, title.trim(), dueDate, req.user.id]
    );
    const result = await query('SELECT * FROM project_milestones WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function updateMilestone(req, res, next) {
  try {
    const { projectId, milestoneId } = req.params;
    const { title, dueDate } = req.body;
    await requireProjectAccess(projectId, req.user.id);

    const exists = await query('SELECT id FROM project_milestones WHERE id = $1 AND project_id = $2', [milestoneId, projectId]);
    if (!exists.rows?.length) throw new AppError('Milestone not found', 404);

    await query(
      `
      UPDATE project_milestones SET
        title = COALESCE($1, title),
        due_date = COALESCE($2, due_date),
        updated_at = NOW()
      WHERE id = $3 AND project_id = $4
      `,
      [title?.trim() || null, dueDate || null, milestoneId, projectId]
    );
    const result = await query('SELECT * FROM project_milestones WHERE id = $1', [milestoneId]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function deleteMilestone(req, res, next) {
  try {
    const { projectId, milestoneId } = req.params;
    await requireProjectAccess(projectId, req.user.id);
    await query('DELETE FROM project_milestones WHERE id = $1 AND project_id = $2', [milestoneId, projectId]);
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

