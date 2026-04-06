-- ============================================================
-- nexus/backend/migrations/001_initial_schema.sql
-- Complete PostgreSQL schema for Nexus.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- trigram search

-- ── ENUMS ────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE user_role       AS ENUM ('user', 'admin', 'superadmin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status  AS ENUM ('active', 'archived', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status     AS ENUM ('todo', 'in_progress', 'in_review', 'done', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_priority   AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE member_role     AS ENUM ('viewer', 'member', 'admin', 'owner');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notif_type      AS ENUM ('task_assigned', 'task_due', 'comment_added',
                                     'mention', 'project_invite', 'status_change');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT,
  full_name       TEXT        NOT NULL,
  avatar_url      TEXT,
  bio             TEXT,
  role            user_role   NOT NULL DEFAULT 'user',
  is_suspended    BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  google_id       TEXT        UNIQUE,
  github_id       TEXT        UNIQUE,
  email_verify_token VARCHAR(64),
  email_verify_expires TIMESTAMPTZ,
  password_reset_token VARCHAR(64),
  password_reset_expires TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── SESSIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT         NOT NULL UNIQUE,
  jti           TEXT         NOT NULL UNIQUE,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  is_revoked    BOOLEAN      NOT NULL DEFAULT FALSE,
  expires_at    TIMESTAMPTZ  NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions (jti);

-- ── TEAMS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  owner_id    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  avatar_url  TEXT,
  plan        TEXT        NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- ── PENDING TEAM INVITATIONS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_invitations (
  id          BIGSERIAL   PRIMARY KEY,
  team_id     UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        member_role NOT NULL DEFAULT 'member',
  invited_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, email)
);

-- ── PROJECTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID           REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT           NOT NULL,
  description TEXT,
  status      project_status NOT NULL DEFAULT 'active',
  color       TEXT           NOT NULL DEFAULT '#6366f1',
  start_date  DATE,
  due_date    DATE,
  created_by  UUID           NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_team  ON projects (team_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ── TASKS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id     UUID          REFERENCES tasks(id) ON DELETE CASCADE, -- subtasks
  title         TEXT          NOT NULL,
  description   TEXT,
  status        task_status   NOT NULL DEFAULT 'todo',
  priority      task_priority NOT NULL DEFAULT 'medium',
  assignee_id   UUID          REFERENCES users(id) ON DELETE SET NULL,
  reporter_id   UUID          NOT NULL REFERENCES users(id),
  due_date      DATE,
  estimated_hrs NUMERIC(6,2),
  actual_hrs    NUMERIC(6,2),
  position      INTEGER       NOT NULL DEFAULT 0, -- ordering within status column
  tags          TEXT[]        DEFAULT '{}',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks (due_date) WHERE due_date IS NOT NULL;

-- ── COMMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users(id),
  body        TEXT        NOT NULL,
  edited_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_task ON comments (task_id);

-- ── ATTACHMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploader_id UUID        NOT NULL REFERENCES users(id),
  filename    TEXT        NOT NULL,
  mime_type   TEXT        NOT NULL,
  size_bytes  BIGINT      NOT NULL,
  s3_key      TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notif_type  NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifs_user_unread ON notifications (user_id, is_read) WHERE NOT is_read;

-- ── AUDIT LOGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  resource    TEXT        NOT NULL,
  resource_id TEXT,
  meta        JSONB       NOT NULL DEFAULT '{}',
  ip_address  INET,
  status      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs (action, created_at DESC);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','teams','projects','tasks']
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
        EXECUTE format(
          'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
           CREATE TRIGGER trg_%s_updated_at
           BEFORE UPDATE ON %s
           FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
          t, t, t, t
        );
    END IF;
  END LOOP;
END$$;

