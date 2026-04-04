-- ============================================================
-- nexus/backend/migrations/001_mysql_schema.sql
-- MySQL (XAMPP) schema for Nexus
-- Run with: mysql -u root nexus_db < 001_mysql_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS nexus_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nexus_db;

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  full_name         VARCHAR(100) NOT NULL,
  avatar_url        TEXT,
  bio               TEXT,
  role              ENUM('user','admin','superadmin') NOT NULL DEFAULT 'user',
  is_suspended      TINYINT(1)   NOT NULL DEFAULT 0,
  email_verified    TINYINT(1)   NOT NULL DEFAULT 0,
  email_verify_token VARCHAR(64),
  email_verify_expires DATETIME,
  password_reset_token VARCHAR(64),
  password_reset_expires DATETIME,
  last_login_at     DATETIME,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_verify_token (email_verify_token),
  INDEX idx_users_reset_token (password_reset_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── SESSIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36)     NOT NULL,
  refresh_token VARCHAR(512) NOT NULL UNIQUE,
  jti           CHAR(36)     NOT NULL UNIQUE,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  is_revoked    TINYINT(1)   NOT NULL DEFAULT 0,
  expires_at    DATETIME     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_jti (jti),
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── TEAMS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  owner_id    CHAR(36)     NOT NULL,
  avatar_url  TEXT,
  plan        VARCHAR(50)  NOT NULL DEFAULT 'free',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  team_id   CHAR(36)    NOT NULL,
  user_id   CHAR(36)    NOT NULL,
  role      ENUM('viewer','member','admin','owner') NOT NULL DEFAULT 'member',
  joined_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PENDING TEAM INVITATIONS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_invitations (
  id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
  team_id    CHAR(36)     NOT NULL,
  email      VARCHAR(255) NOT NULL,
  role       ENUM('viewer','member','admin') NOT NULL DEFAULT 'member',
  invited_by CHAR(36)     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pending_team_email (team_id, email),
  INDEX idx_pending_email (email),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PROJECTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
  team_id     CHAR(36),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  status      ENUM('active','archived','deleted') NOT NULL DEFAULT 'active',
  color       VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
  start_date  DATE,
  due_date    DATE,
  created_by  CHAR(36)    NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id)   REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_projects_team   (team_id),
  INDEX idx_projects_status (status),
  INDEX idx_projects_creator (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_members (
  project_id CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  role       ENUM('viewer','member','admin','owner') NOT NULL DEFAULT 'member',
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PROJECT MILESTONES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_milestones (
  id          CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
  project_id  CHAR(36)    NOT NULL,
  title       VARCHAR(255) NOT NULL,
  due_date    DATE        NOT NULL,
  created_by  CHAR(36)    NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_milestones_project (project_id),
  INDEX idx_milestones_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── TASKS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
  project_id    CHAR(36)    NOT NULL,
  parent_id     CHAR(36),
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  status        ENUM('todo','in_progress','in_review','done','cancelled') NOT NULL DEFAULT 'todo',
  priority      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  assignee_id   CHAR(36),
  reporter_id   CHAR(36)    NOT NULL,
  due_date      DATE,
  estimated_hrs DECIMAL(6,2),
  actual_hrs    DECIMAL(6,2),
  position      INT         NOT NULL DEFAULT 0,
  tags          JSON,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)   REFERENCES tasks(id)    ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  INDEX idx_tasks_project  (project_id),
  INDEX idx_tasks_assignee (assignee_id),
  INDEX idx_tasks_status   (status),
  INDEX idx_tasks_due_date (due_date),
  FULLTEXT INDEX idx_tasks_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── COMMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  task_id    CHAR(36) NOT NULL,
  author_id  CHAR(36) NOT NULL,
  body       TEXT     NOT NULL,
  edited_at  DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)   REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id),
  INDEX idx_comments_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)    PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36)    NOT NULL,
  type       ENUM('task_assigned','task_due','comment_added','mention','project_invite','status_change') NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT,
  link       VARCHAR(500),
  is_read    TINYINT(1)  NOT NULL DEFAULT 0,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifs_user_unread (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── AUDIT LOGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT      PRIMARY KEY AUTO_INCREMENT,
  user_id     CHAR(36),
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  meta        JSON        NOT NULL,
  ip_address  VARCHAR(45),
  status      VARCHAR(50) NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user   (user_id),
  INDEX idx_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── DEVELOPMENT SEED DATA ────────────────────────────────────
-- Seed admin user (password: Admin123)
INSERT IGNORE INTO users (id, email, password_hash, full_name, role, email_verified)
VALUES (
  '00000000-0000-4000-a000-000000000001',
  'admin@nexus.dev',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGdstHJmf8PoHoxHSe7EjVdDwN2',
  'Nexus Admin',
  'admin',
  1
);

-- Seed demo user (password: Demo1234)
INSERT IGNORE INTO users (id, email, password_hash, full_name, role, email_verified)
VALUES (
  '00000000-0000-4000-a000-000000000002',
  'demo@nexus.dev',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC__cAB9oAX.NW4USJL6',
  'Demo User',
  'user',
  1
);

-- Seed demo team
INSERT IGNORE INTO teams (id, name, slug, owner_id)
VALUES (
  '00000000-0000-4000-b000-000000000001',
  'Nexus Demo Team',
  'nexus-demo',
  '00000000-0000-4000-a000-000000000001'
);

-- Add both users to the team
INSERT IGNORE INTO team_members (team_id, user_id, role) VALUES
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'member');
