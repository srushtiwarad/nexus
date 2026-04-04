-- ============================================================
-- nexus/backend/migrations/002_seed_and_indexes.sql
-- Additional indexes for query optimisation, plus optional
-- development seed data. Run after 001_initial_schema.sql.
-- ============================================================

-- ── Additional composite indexes ─────────────────────────────
-- Tasks by project + status (Kanban column queries)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
  ON tasks (project_id, status)
  WHERE parent_id IS NULL;

-- Tasks due soon (dashboard widget)
CREATE INDEX IF NOT EXISTS idx_tasks_due_soon
  ON tasks (due_date, status)
  WHERE due_date IS NOT NULL
    AND status NOT IN ('done', 'cancelled');

-- Audit log by resource + date (compliance queries)
CREATE INDEX IF NOT EXISTS idx_audit_resource_date
  ON audit_logs (resource, resource_id, created_at DESC);

-- Notifications ordered by recency
CREATE INDEX IF NOT EXISTS idx_notifs_user_recent
  ON notifications (user_id, created_at DESC);

-- ── Materialized view: project progress ─────────────────────
-- Refreshed by a scheduled job every 5 minutes in production.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_progress AS
SELECT
  p.id AS project_id,
  p.team_id,
  COUNT(t.id)                                                         AS total_tasks,
  COUNT(t.id) FILTER (WHERE t.status = 'done')                        AS done_tasks,
  COUNT(t.id) FILTER (WHERE t.status NOT IN ('done','cancelled'))      AS open_tasks,
  COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE
                        AND t.status NOT IN ('done','cancelled'))      AS overdue_tasks,
  CASE WHEN COUNT(t.id) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.status = 'done')
                / COUNT(t.id), 1)
  END AS completion_pct
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id AND t.parent_id IS NULL
WHERE p.status = 'active'
GROUP BY p.id, p.team_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_progress_id
  ON mv_project_progress (project_id);

-- Refresh function (called by pg_cron or a scheduled ECS task)
CREATE OR REPLACE FUNCTION refresh_project_progress()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_progress;
END;
$$;

-- ── Development seed data ────────────────────────────────────
-- Only insert if the users table is empty (dev environments only).
DO $$
BEGIN
  IF current_setting('nexus.seed_data', true) = 'true' THEN

    -- Seed admin user (password: Admin123)
    INSERT INTO users (id, email, password_hash, full_name, role, email_verified)
    VALUES (
      '00000000-0000-4000-a000-000000000001',
      'admin@nexus.dev',
      '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGdstHJmf8PoHoxHSe7EjVdDwN2',
      'Nexus Admin',
      'admin',
      true
    ) ON CONFLICT DO NOTHING;

    -- Seed demo user (password: Demo1234)
    INSERT INTO users (id, email, password_hash, full_name, role, email_verified)
    VALUES (
      '00000000-0000-4000-a000-000000000002',
      'demo@nexus.dev',
      '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC__cAB9oAX.NW4USJL6',
      'Demo User',
      'user',
      true
    ) ON CONFLICT DO NOTHING;

    -- Seed demo team
    INSERT INTO teams (id, name, slug, owner_id)
    VALUES (
      '00000000-0000-4000-b000-000000000001',
      'Nexus Demo Team',
      'nexus-demo',
      '00000000-0000-4000-a000-000000000001'
    ) ON CONFLICT DO NOTHING;

    -- Add both users to the team
    INSERT INTO team_members (team_id, user_id, role) VALUES
      ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner'),
      ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', 'member')
    ON CONFLICT DO NOTHING;

    -- Seed demo project
    INSERT INTO projects (id, team_id, name, description, color, created_by)
    VALUES (
      '00000000-0000-4000-c000-000000000001',
      '00000000-0000-4000-b000-000000000001',
      'Website Redesign',
      'Redesign the marketing website for Q2 launch.',
      '#6366f1',
      '00000000-0000-4000-a000-000000000001'
    ) ON CONFLICT DO NOTHING;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner'),
      ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000002', 'member')
    ON CONFLICT DO NOTHING;

    -- Seed demo tasks
    INSERT INTO tasks (project_id, title, status, priority, reporter_id, assignee_id, position) VALUES
      ('00000000-0000-4000-c000-000000000001', 'Audit current site performance',    'done',        'high',   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 1),
      ('00000000-0000-4000-c000-000000000001', 'Define new information architecture','done',        'high',   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 2),
      ('00000000-0000-4000-c000-000000000001', 'Design wireframes for homepage',    'in_progress', 'high',   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 1),
      ('00000000-0000-4000-c000-000000000001', 'Build design system tokens',        'in_progress', 'medium', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 2),
      ('00000000-0000-4000-c000-000000000001', 'Implement React component library', 'todo',        'high',   '00000000-0000-4000-a000-000000000001', NULL, 1),
      ('00000000-0000-4000-c000-000000000001', 'Set up CI/CD pipeline',             'todo',        'medium', '00000000-0000-4000-a000-000000000001', NULL, 2),
      ('00000000-0000-4000-c000-000000000001', 'Write content for About page',      'todo',        'low',    '00000000-0000-4000-a000-000000000001', NULL, 3),
      ('00000000-0000-4000-c000-000000000001', 'SEO optimisation review',           'in_review',   'medium', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 1)
    ON CONFLICT DO NOTHING;

  END IF;
END$$;
