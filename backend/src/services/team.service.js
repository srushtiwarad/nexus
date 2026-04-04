// ============================================================
// nexus/backend/src/services/team.service.js
// Pending invitation processing for OAuth logins.
// ============================================================

const { query } = require('../config/database');

async function processPendingInvitations(userId, email) {
  if (!userId || !email) return;

  try {
    const pending = await query(
      'SELECT team_id, role FROM pending_invitations WHERE email = ?',
      [email]
    );

    for (const inv of pending.rows || []) {
      // Check if already a member before inserting
      const existing = await query(
        'SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?',
        [inv.team_id, userId]
      );

      if (existing.rows.length === 0) {
        await query(
          'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
          [inv.team_id, userId, inv.role || 'member']
        );
      }

      await query(
        'DELETE FROM pending_invitations WHERE team_id = ? AND email = ?',
        [inv.team_id, email]
      );
    }
  } catch (err) {
    // Don't let invitation processing failures block registration/login
    console.error('processPendingInvitations error:', err.message);
  }
}

module.exports = { processPendingInvitations };
