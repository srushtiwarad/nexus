// ============================================================
// nexus/backend/src/controllers/auth.controller.js
// FIXED: MySQL compatibility + safe login handling
// ============================================================

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const {
  signAccessToken,
  signRefreshToken,
  blacklistToken
} = require('../middleware/auth.middleware');
const { AppError } = require('../middleware/errorHandler');
const emailService = require('../services/email.service');
const { processPendingInvitations } = require('../services/team.service');

const SALT_ROUNDS = 12;
const CLIENT_URL = process.env.FRONTEND_URL || 'http://localhost:5173';


// ── Validators ───────────────────────────────────────────────
const registerValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').trim().isLength({ min: 2, max: 100 }),
];

const loginValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];


// ── Helper: Create Session + Tokens ──────────────────────────
async function createSessionAndTokens(req, user) {
  const jti = uuidv4();

  const payload = {
    sub: user.id,
    role: user.role || 'user',
    jti
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions 
     (id, user_id, refresh_token, jti, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      user.id,
      refreshToken,
      jti,
      req.ip,
      req.headers['user-agent']?.slice(0, 500),
      expiresAt
    ]
  );

  return { accessToken, refreshToken };
}


// ── REGISTER ────────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new AppError('Validation failed', 422);

    const { email, password, fullName } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);

    if (existing.rows.length > 0)
      throw new AppError('Email already registered', 409);

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const userId = uuidv4();

    // Auto-verify email so the user can log in immediately
    await query(
      `INSERT INTO users 
       (id, email, password_hash, full_name, email_verified)
       VALUES (?, ?, ?, ?, 1)`,
      [userId, email, hash, fullName]
    );

    await processPendingInvitations(userId, email).catch(() => {});

    // Fire-and-forget welcome email
    emailService.sendWelcomeEmail({ to: email, fullName }).catch(() => { });

    // Create session and return tokens so frontend can navigate to dashboard
    const user = { id: userId, email, full_name: fullName, role: 'user' };
    const tokens = await createSessionAndTokens(req, user);

    res.status(201).json({
      user: {
        id: userId,
        email,
        fullName,
        role: 'user'
      },
      ...tokens
    });

  } catch (err) { next(err); }
}


// ── LOGIN ───────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new AppError('Validation failed', 422);

    const { email, password } = req.body;

    console.log('🔐 LOGIN ATTEMPT - Email:', email);

    const users = await query(
      `SELECT * FROM users WHERE email = ?`,
      [email]
    );

    console.log('📊 QUERY RESULT:', users);
    console.log('📊 ROWS LENGTH:', users?.rows?.length);

    if (!users || !users.rows || users.rows.length === 0) {
      console.log('❌ USER NOT FOUND:', email);
      throw new AppError('Invalid credentials', 401);
    }

    const user = users.rows[0];
    console.log('✅ USER FOUND:', user.email);

    // ✅ EXTRA SAFETY
    if (!user || !user.password_hash) {
      console.log('❌ NO PASSWORD HASH');
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    console.log('🔑 PASSWORD MATCH:', valid);

    if (!valid) throw new AppError('Invalid credentials', 401);

    if (user.is_suspended) {
      throw new AppError('Account suspended', 403);
    }

    if (user.email_verified === 0) {
      throw new AppError('Verify your email first', 403);
    }

    await query(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );

    const tokens = await createSessionAndTokens(req, user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      },
      ...tokens
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    next(err);
  }
}

// ── GOOGLE CALLBACK ─────────────────────────────────────────
async function googleCallback(req, res, next) {
  try {
    const profile = req.user;
    if (!profile) throw new AppError('Google auth failed', 401);

    const email = profile.emails?.[0]?.value;
    if (!email) throw new AppError('Google email not available', 401);

    const result = await query('SELECT * FROM users WHERE email = ?', [email]);
    let user = result.rows[0];

    if (!user) {
      const userId = uuidv4();
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

      await query(
        `INSERT INTO users (id, email, password_hash, full_name, email_verified)
         VALUES (?, ?, ?, ?, 1)`,
        [userId, email, hashedPassword, profile.displayName || email]
      );

      const newUser = await query('SELECT * FROM users WHERE id = ?', [userId]);
      user = newUser.rows[0];
    }

    await processPendingInvitations(user.id, user.email);

    const tokens = await createSessionAndTokens(req, user);

    res.redirect(`${CLIENT_URL}/oauth-success?access=${tokens.accessToken}&refresh=${tokens.refreshToken}`);

  } catch (err) { next(err); }
}


// ── GITHUB CALLBACK ─────────────────────────────────────────
async function githubCallback(req, res, next) {
  try {
    const profile = req.user;
    if (!profile) throw new AppError('GitHub auth failed', 401);

    // Some users don't have public emails. Passport-github2 requests 'user:email' scope,
    // but we should still handle the fallback.
    const email = profile.emails?.[0]?.value || profile._json?.email || `${profile.username}@github.com`;
    const fullName = profile.displayName || profile.username || email.split('@')[0];

    console.log(`🐙 GITHUB LOGIN: ${email} (${fullName})`);

    const result = await query('SELECT * FROM users WHERE email = ?', [email]);
    let user = result.rows[0];

    if (!user) {
      console.log(`🆕 CREATING NEW GITHUB USER: ${email}`);
      const userId = uuidv4();
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

      await query(
        `INSERT INTO users (id, email, password_hash, full_name, email_verified)
         VALUES (?, ?, ?, ?, 1)`,
        [userId, email, hashedPassword, fullName]
      );

      const newUser = await query('SELECT * FROM users WHERE id = ?', [userId]);
      user = newUser.rows[0];
    }

    await processPendingInvitations(user.id, user.email).catch(e => console.error('Invite processing failed:', e));

    const tokens = await createSessionAndTokens(req, user);
    console.log(`✅ GITHUB AUTH SUCCESS: ${user.email}`);

    res.redirect(`${CLIENT_URL}/oauth-success?access=${tokens.accessToken}&refresh=${tokens.refreshToken}`);

  } catch (err) {
    console.error('❌ GITHUB AUTH ERROR:', err);
    next(err);
  }
}


// ── LOGOUT ──────────────────────────────────────────────────
async function logout(req, res, next) {
  try {
    if (req.tokenJTI) {
      await blacklistToken(req.tokenJTI, 900);
      await query('UPDATE sessions SET is_revoked = 1 WHERE jti = ?', [req.tokenJTI]);
    }
    res.json({ message: 'Logged out' });
  } catch (err) { next(err); }
}


// ── LOGOUT ALL ──────────────────────────────────────────────
async function logoutAll(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError('Unauthorized', 401);

    await query('UPDATE sessions SET is_revoked = 1 WHERE user_id = ?', [userId]);

    if (req.tokenJTI) {
      await blacklistToken(req.tokenJTI, 900);
    }

    res.json({ message: 'All sessions revoked' });
  } catch (err) {
    next(err);
  }
}


// ── ME ──────────────────────────────────────────────────────
async function me(req, res) {
  res.json(req.user);
}


// ── EXPORTS ─────────────────────────────────────────────────
module.exports = {
  register,
  login,
  logout,
  logoutAll,
  me,
  googleCallback,
  githubCallback,
  registerValidators,
  loginValidators
};