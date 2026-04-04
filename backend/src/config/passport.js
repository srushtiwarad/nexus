const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const userService = require('../services/user.service');
// Note: OAuth user mapping is handled in `auth.controller.js` callbacks.
// Keep imports minimal so lint doesn't fail on unused variables.

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/google/callback`,
            },
            async (accessToken, refreshToken, profile, done) => {
                console.log(`🌐 GOOGLE STRATEGY CALLBACK URL: ${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/google/callback`);
                // Keep Passport "verify" lightweight.
                // We'll map/create the user in `googleCallback()` using the current DB schema.
                return done(null, profile);
            }
        )
    );
} else {
    console.warn('Google OAuth credentials missing. Google login will not work.');
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
        new GitHubStrategy(
            {
                clientID: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/github/callback`,
            },
            async (accessToken, refreshToken, profile, done) => {
                console.log(`🌐 GITHUB STRATEGY CALLBACK URL: ${process.env.BACKEND_URL || 'http://localhost:3002'}/api/v1/auth/github/callback`);
                // Keep Passport "verify" lightweight.
                // We'll map/create the user in `githubCallback()` using the current DB schema.
                return done(null, profile);
            }
        )
    );
} else {
    console.warn('GitHub OAuth credentials missing. GitHub login will not work.');
}

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await userService.getUserById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;
