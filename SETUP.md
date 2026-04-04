# Nexus — Setup Guide (XAMPP + MySQL)

## Prerequisites
- **XAMPP** installed and running (Apache + MySQL)
- **Node.js** v18+
- **npm** v9+

---

## 1. Database Setup (XAMPP)

1. Open **phpMyAdmin** → `http://localhost/phpmyadmin`
2. Click **"New"** to create a database called `nexus_db`
3. Select `nexus_db`, go to the **SQL** tab
4. Paste and run the contents of `backend/migrations/001_mysql_schema.sql`

---

## 2. Backend Setup

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nexus_db
DB_USER=root
DB_PASSWORD=          # blank by default in XAMPP

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # Gmail App Password (not your login password)
EMAIL_FROM=your_gmail@gmail.com
APP_URL=http://localhost:5173

JWT_ACCESS_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<run same command again>
```

> **Gmail App Password**: Go to Google Account → Security → 2-Step Verification → App passwords → Generate one for "Mail"

```bash
npm install
npm run dev     # starts on http://localhost:3001
```

---

## 3. Frontend Setup

```bash
cd frontend
cp .env.example .env    # VITE_API_URL=http://localhost:3001/api/v1
npm install
npm run dev             # starts on http://localhost:5173
```

---

## Features Added

### 🔐 Authentication
- **Email Verification** — Users must verify email before login
- **Forgot Password** — Reset via secure email link (1hr expiry)
- **Password Strength Indicator** — Live feedback on register page
- **Resend Verification** — From login page if unverified

### 🗄️ MySQL (XAMPP)
- Full MySQL schema with proper indexes, FKs, JSON columns
- `mysql2` driver replacing `pg`
- `?` placeholders (MySQL-compatible)

### 👤 Session Management
- Sessions stored in `sessions` table (not just JWT blacklist)
- View all active sessions on Profile page
- Revoke individual sessions
- "Sign out all other sessions" danger zone
- Token rotation on refresh

### 📊 Dashboard
- Stats cards (active projects, total, completed, role)
- Recent projects with due date indicators
- Quick action shortcuts
- Account summary with verification badge

### 👤 User Profile
- Editable full name + bio
- Password change with validation
- Active sessions viewer with revoke
- Avatar initials with consistent colors

---

## Project Structure (Changes)

```
backend/
  migrations/
    001_mysql_schema.sql          ← NEW: Full MySQL schema
  src/
    config/database.js            ← UPDATED: mysql2 pool
    controllers/
      auth.controller.js          ← UPDATED: email verify, sessions, password reset
      project.controller.js       ← UPDATED: MySQL queries
      task.controller.js          ← UPDATED: MySQL queries
    middleware/
      auth.middleware.js          ← UPDATED: DB-backed sessions
    routes/
      auth.routes.js              ← UPDATED: new endpoints
      user.routes.js              ← UPDATED: MySQL queries
    services/
      email.service.js            ← UPDATED: verification + reset emails

frontend/
  src/
    App.tsx                       ← UPDATED: new routes
    services/api.ts               ← UPDATED: new auth API calls
    store/auth.store.ts           ← UPDATED: bio, emailVerified, updateUser
    components/
      auth/
        LoginPage.tsx             ← UPDATED: unverified warning, forgot link
        RegisterPage.tsx          ← UPDATED: success screen, password strength
        VerifyEmailPage.tsx       ← NEW
        ForgotPasswordPage.tsx    ← NEW
        ResetPasswordPage.tsx     ← NEW
      dashboard/
        DashboardHome.tsx         ← NEW: stats, recent projects, quick actions
        DashboardLayout.tsx       ← UPDATED: collapsible sidebar
        ProfilePage.tsx           ← UPDATED: bio, sessions, danger zone
```
