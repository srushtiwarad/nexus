const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const { AppError } = require('../middleware/errorHandler');

// Search users
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const result = await query(
      `SELECT id, email, full_name, avatar_url FROM users WHERE (full_name ILIKE $1 OR email ILIKE $2) AND id != $3 LIMIT 10`,
      [`%${q}%`, `%${q}%`, req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Update profile
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) throw new AppError('Forbidden', 403);
    const { fullName, bio, avatarUrl } = req.body;
    await query(
      `UPDATE users SET full_name = COALESCE($1, full_name), bio = COALESCE($2, bio), avatar_url = COALESCE($3, avatar_url) WHERE id = $4`,
      [fullName || null, bio !== undefined ? bio : null, avatarUrl || null, req.user.id]
    );
    const result = await query('SELECT id, email, full_name, bio, avatar_url, role FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// Change password
router.post('/:id/change-password', authenticate, async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) throw new AppError('Forbidden', 403);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Both passwords required', 400);
    if (newPassword.length < 8) throw new AppError('New password must be at least 8 characters', 400);

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) throw new AppError('Current password is incorrect', 400);

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
