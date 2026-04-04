const express = require('express');
const router = express.Router();
const passport = require('passport');

const {
  register, login, logout, logoutAll, me,
  googleCallback, githubCallback,
  registerValidators, loginValidators
} = require('../controllers/auth.controller');

const { authenticate, rotateRefreshToken } = require('../middleware/auth.middleware');
const { authRateLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/auditLog.middleware');

const CLIENT_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// BASIC AUTH
router.post('/register', authRateLimiter, registerValidators, auditLog('auth'), register);
router.post('/login', authRateLimiter, loginValidators, auditLog('auth'), login);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.post('/refresh', authRateLimiter, rotateRefreshToken);
router.get('/me', authenticate, me);

// ── DIAGNOSTIC ──────────────────────────────
router.get('/diag', (req, res) => {
  res.json({
    env: process.env.NODE_ENV,
    port: process.env.PORT || 3002,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3002',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    githubConfigured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    allowedOrigins: process.env.ALLOWED_ORIGINS
  });
});

// ── GOOGLE AUTH ─────────────────────────────
router.get('/google', authRateLimiter, (req, res, next) => {
  if (!passport._strategy('google')) {
    return res.status(501).json({ error: 'Google login not configured' });
  }
  const callbackURL = `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/google/callback`;
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    callbackURL
  })(req, res, next);
});

router.get('/google/callback',
  authRateLimiter,
  auditLog('auth'),
  (req, res, next) => {
    if (!passport._strategy('google')) {
      return res.status(501).json({ error: 'Google login not configured' });
    }

    const callbackURL = `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/google/callback`;
    passport.authenticate('google', { session: false, callbackURL }, (err, user) => {
      if (err) {
        console.error('Google Auth Error:', err);
        return res.redirect(`${CLIENT_URL}/login?error=server_error`);
      }
      if (!user) {
        return res.redirect(`${CLIENT_URL}/login?error=auth_failed`);
      }

      req.user = user;
      googleCallback(req, res, next);
    })(req, res, next);
  }
);

// ── GITHUB AUTH ─────────────────────────────
router.get('/github', authRateLimiter, (req, res, next) => {
  if (!passport._strategy('github')) {
    return res.status(501).json({ error: 'GitHub login not configured' });
  }
  const callbackURL = `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/github/callback`;
  passport.authenticate('github', { 
    scope: ['user:email'],
    callbackURL
  })(req, res, next);
});

router.get('/github/callback',
  authRateLimiter,
  auditLog('auth'),
  (req, res, next) => {
    if (!passport._strategy('github')) {
      return res.status(501).json({ error: 'GitHub login not configured' });
    }

    const callbackURL = `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/github/callback`;
    passport.authenticate('github', { session: false, callbackURL }, (err, user) => {
      if (err) {
        console.error('GitHub Auth Error:', err);
        return res.redirect(`${CLIENT_URL}/login?error=server_error`);
      }
      if (!user) {
        return res.redirect(`${CLIENT_URL}/login?error=auth_failed`);
      }

      req.user = user;
      githubCallback(req, res, next);
    })(req, res, next);
  }
);

module.exports = router;