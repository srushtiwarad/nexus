// ============================================================
// nexus/backend/src/middleware/auth.middleware.js
// JWT sign/verify + session-based refresh rotation (MySQL)
// ============================================================
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { AppError } = require('./errorHandler');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me';
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = parseInt(process.env.JWT_REFRESH_TTL_SEC || '604800'); // 7 days

// ================= TOKEN FUNCTIONS =================
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

// ================= TOKEN BLACKLIST =================
const blacklist = new Set();

function blacklistToken(jti, ttlSeconds) {
  blacklist.add(jti);
  setTimeout(() => blacklist.delete(jti), ttlSeconds * 1000);
  return Promise.resolve();
}

// ================= AUTHENTICATE =================
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('No token provided', 401);

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, ACCESS_SECRET);
    } catch {
      throw new AppError('Invalid or expired token', 401);
    }

    if (blacklist.has(payload.jti)) throw new AppError('Token has been revoked', 401);

    const result = await query(
      'SELECT id, email, full_name, role, avatar_url, bio, is_suspended, email_verified FROM users WHERE id = $1',
      [payload.sub]
    );

    const user = result.rows[0];
    if (!user) throw new AppError('User not found', 401);
    if (user.is_suspended) throw new AppError('Account suspended', 403);

    req.user = user;
    req.tokenJTI = payload.jti;

    next();
  } catch (err) {
    next(err);
  }
}

// ================= REFRESH TOKEN =================
async function rotateRefreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    let payload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const result = await query(
      'SELECT id FROM sessions WHERE refresh_token = $1 AND is_revoked = FALSE AND expires_at > NOW()',
      [refreshToken]
    );

    if (result.rows.length === 0) {
      throw new AppError('Session not found or revoked', 401);
    }

    await query('UPDATE sessions SET is_revoked = TRUE WHERE refresh_token = $1', [refreshToken]);

    const jti = uuidv4();
    const newPayload = { sub: payload.sub, role: payload.role, jti };

    const newAccess = signAccessToken(newPayload);
    const newRefresh = signRefreshToken(newPayload);

    const expiresAt = new Date(Date.now() + REFRESH_TTL * 1000);

    await query(
      `INSERT INTO sessions (id, user_id, refresh_token, jti, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), payload.sub, newRefresh, jti, expiresAt]
    );

    res.json({
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiresIn: 900
    });

  } catch (err) {
    next(err);
  }
}

// ================= ROLE CHECK =================
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

// ================= PROJECT MEMBERSHIP =================
async function requireProjectMembership(req, res, next) {
  try {
    const userId = req.user.id;
    const projectId = req.params.pid || req.params.projectId; // Support both naming styles

    const result = await query(
      `SELECT role FROM project_members 
       WHERE user_id = $1 AND project_id = $2`,
      [userId, projectId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Access denied: Not a project member', 403));
    }

    req.projectRole = result.rows[0].role;
    next();
  } catch (err) {
    next(err);
  }
}

// ================= EXPORT =================
module.exports = {
  signAccessToken,
  signRefreshToken,
  blacklistToken,
  authenticate,
  rotateRefreshToken,
  requireRole,
  requireProjectMembership  // ✅ FIXED
};