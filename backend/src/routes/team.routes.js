// nexus/backend/src/routes/team.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { writeRateLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/auditLog.middleware');
const { validateUUID } = require('../middleware/sanitize');
const { query, withTransaction } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

router.use(authenticate);

async function requireTeamMember(teamId, userId) {
  const membership = await query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  if (!membership.rows.length) throw new AppError('Not a team member', 403);
  return membership.rows[0];
}

async function requireTeamAdmin(teamId, userId) {
  const membership = await requireTeamMember(teamId, userId);
  if (!['admin', 'owner'].includes(membership.role)) {
    throw new AppError('Only team admins can manage invitations', 403);
  }
  return membership;
}

// GET /api/v1/teams — list my teams
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT t.*, tm.role AS my_role,
             COUNT(DISTINCT tm2.user_id) AS member_count,
             COUNT(DISTINCT p.id) AS project_count
      FROM teams t
      JOIN team_members tm  ON tm.team_id = t.id AND tm.user_id = $1
      JOIN team_members tm2 ON tm2.team_id = t.id
      LEFT JOIN projects p  ON p.team_id = t.id AND p.status = 'active'
      GROUP BY t.id, tm.role ORDER BY t.name
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/v1/teams/:teamId/members — list team members
router.get('/:teamId/members', validateUUID('teamId'), async (req, res, next) => {
  try {
    await requireTeamMember(req.params.teamId, req.user.id);

    const result = await query(
      `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.avatar_url,
        tm.role,
        tm.joined_at
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY
        CASE tm.role
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'member' THEN 2
          WHEN 'viewer' THEN 3
          ELSE 9
        END,
        u.full_name
      `,
      [req.params.teamId]
    );

    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/v1/teams/:teamId/pending — list pending invitations
router.get('/:teamId/pending', validateUUID('teamId'), async (req, res, next) => {
  try {
    await requireTeamMember(req.params.teamId, req.user.id);
    const result = await query(
      `
      SELECT
        id,
        team_id,
        email,
        role,
        invited_by,
        created_at
      FROM pending_invitations
      WHERE team_id = $1
      ORDER BY created_at DESC
      `,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/v1/teams
router.post('/', writeRateLimiter, auditLog('team'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) throw new AppError('Team name required', 400);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const created = await withTransaction(async (conn) => {
      await conn.execute(
        'INSERT INTO teams (name, slug, owner_id) VALUES (?, ?, ?)',
        [name.trim(), slug, req.user.id]
      );

      const [rows] = await conn.execute(
        'SELECT * FROM teams WHERE slug = ? ORDER BY created_at DESC LIMIT 1',
        [slug]
      );
      const team = Array.isArray(rows) ? rows[0] : rows;
      if (!team?.id) throw new AppError('Failed to create team', 500);

      await conn.execute(
        'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
        [team.id, req.user.id, 'owner']
      );
      return team;
    });

    res.status(201).json(created);
  } catch (err) { next(err); }
});

// POST /api/v1/teams/:teamId/invite
router.post('/:teamId/invite', validateUUID('teamId'), writeRateLimiter, auditLog('team'), async (req, res, next) => {
  try {
    const { email, role = 'member' } = req.body;
    if (!email) throw new AppError('Email required', 400);

    await requireTeamAdmin(req.params.teamId, req.user.id);

    const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (!userResult.rows.length) {
      // User hasn't registered yet — store pending invite.
      await query(
        `INSERT INTO pending_invitations (team_id, email, role, invited_by)
         VALUES ($1, $2, $3, $4)
         ON DUPLICATE KEY UPDATE role = VALUES(role), invited_by = VALUES(invited_by)`,
        [req.params.teamId, email, role, req.user.id]
      );
      return res.json({ message: 'Invitation saved. Member will be added after they register/login.' });
    }

    const inviteeId = userResult.rows[0].id;
    await query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, $3)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [req.params.teamId, inviteeId, role]
    );
    res.json({ message: 'Member added successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/:teamId/pending — revoke a pending invitation
router.delete('/:teamId/pending', validateUUID('teamId'), writeRateLimiter, auditLog('team'), async (req, res, next) => {
  try {
    const email = req.body?.email || req.query?.email;
    if (!email) throw new AppError('Email required', 400);
    await requireTeamAdmin(req.params.teamId, req.user.id);

    await query(
      'DELETE FROM pending_invitations WHERE team_id = $1 AND email = $2',
      [req.params.teamId, email]
    );
    res.json({ message: 'Invitation revoked' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/teams/:teamId/members/:userId
router.delete('/:teamId/members/:userId', validateUUID('teamId'), validateUUID('userId'), auditLog('team'), async (req, res, next) => {
  try {
    const isSelf = req.params.userId === req.user.id;
    if (!isSelf) {
      const m = await requireTeamMember(req.params.teamId, req.user.id);
      if (!['admin','owner'].includes(m.role)) throw new AppError('Insufficient permissions', 403);
    }
    await query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [req.params.teamId, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); }
});

module.exports = router;
