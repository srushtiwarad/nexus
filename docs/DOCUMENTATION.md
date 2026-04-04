# Nexus — Complete Project Documentation

> **Version:** 1.0.0 | **Stack:** Node.js · React · PostgreSQL · Redis · AWS
> **Architecture:** Cloud-native SaaS (ECS Fargate + RDS + ElastiCache + CloudFront)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Data Models](#3-data-models)
4. [Security Layer](#4-security-layer)
5. [Backend API Reference](#5-backend-api-reference)
6. [Frontend Module](#6-frontend-module)
7. [Cloud Infrastructure](#7-cloud-infrastructure)
8. [Performance & Scalability](#8-performance--scalability)
9. [Development Setup](#9-development-setup)
10. [Deployment Guide](#10-deployment-guide)
11. [Monitoring & Observability](#11-monitoring--observability)
12. [Security Hardening Checklist](#12-security-hardening-checklist)

---

## 1. Project Overview

**Nexus** is a multi-tenant project and task management SaaS application. It provides team-based project organisation with Kanban-style task boards, real-time collaboration via WebSockets, role-based access control, and a fully auditable security layer.

### Key Capabilities

| Capability | Implementation |
|---|---|
| Authentication | Custom JWT with refresh-token rotation |
| Authorisation | Role-based (RBAC) at team + project level |
| Real-time updates | WebSocket rooms per project |
| Rate limiting | Redis-backed sliding window (5000 req/15 min) |
| Database | PostgreSQL 15 on AWS RDS (partitioned audit logs) |
| Caching | Redis 7 on ElastiCache |
| File storage | AWS S3 with presigned URLs |
| Frontend | React 18 SPA via CloudFront CDN |
| CI/CD | GitHub Actions → ECR → ECS Fargate |

---

## 2. System Architecture

### High-Level Flow

```
Client (Browser / Mobile)
       │ HTTPS / WSS
       ▼
CloudFront CDN  ──────────►  S3 (React SPA, static assets)
       │
       │ API requests → api.nexus.io
       ▼
WAF (AWS WAFv2)                ← blocks bad actors, rate-limits IPs
       │
       ▼
Application Load Balancer      ← TLS termination, HTTP→HTTPS redirect
       │
       ▼
ECS Fargate (2× tasks)         ← auto-scales 1–10 tasks on CPU %
  ├── Express API (port 3001)
  ├── Custom Security Middleware stack
  └── WebSocket server (/ws)
       │
   ┌───┴───────────────────┐
   ▼                       ▼
RDS PostgreSQL 15       ElastiCache Redis 7
(primary + read replica)   (rate limits, token blacklist,
 Multi-AZ in prod)          sessions, pub/sub)
       │
       ▼
S3 (attachment storage, versioned, encrypted)
```

### Component Directory

```
nexus/
├── backend/                   Node.js Express API
│   ├── src/
│   │   ├── server.js          Entry point
│   │   ├── app.js             Express + middleware wiring
│   │   ├── config/
│   │   │   ├── database.js    PostgreSQL pool
│   │   │   └── redis.js       ioredis client
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js      JWT + RBAC (SECURITY)
│   │   │   ├── rateLimiter.js          Redis rate limiting (SECURITY)
│   │   │   ├── sanitize.js             XSS + SQLi guard (SECURITY)
│   │   │   ├── auditLog.middleware.js  Immutable audit trail (SECURITY)
│   │   │   └── errorHandler.js        Centralised error handling
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── task.controller.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── project.routes.js
│   │   │   ├── task.routes.js
│   │   │   ├── team.routes.js
│   │   │   └── user.routes.js
│   │   ├── services/
│   │   │   ├── user.service.js
│   │   │   ├── project.service.js
│   │   │   └── websocket.service.js
│   │   └── utils/logger.js
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                  React 18 SPA
│   ├── src/
│   │   ├── main.tsx           Entry + QueryClient
│   │   ├── App.tsx            Router + route guards
│   │   ├── services/api.ts    Axios + auto-refresh
│   │   ├── store/auth.store.ts Zustand auth state
│   │   ├── hooks/useWebSocket.ts  Real-time hook
│   │   └── components/
│   │       ├── auth/          Login, Register pages
│   │       ├── dashboard/     Layout, Profile
│   │       └── projects/      ProjectsPage, ProjectBoard
│   └── package.json
│
├── infra/
│   └── cloudformation.yaml   Complete AWS stack
├── .github/workflows/
│   └── deploy.yml            GitHub Actions CI/CD
└── docker-compose.yml        Local dev environment
```

---

## 3. Data Models

### Entity-Relationship Overview

```
users ──< team_members >── teams ──< projects ──< project_members
                                         │
                                         └──< tasks ──< tasks (subtasks)
                                                  │
                                                  ├──< comments
                                                  └──< attachments

users ──< notifications
users ──< audit_logs
```

### Model Definitions

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | `uuid_generate_v4()` |
| `email` | TEXT UNIQUE | Normalised + indexed |
| `password_hash` | TEXT | bcrypt, 12 rounds |
| `full_name` | TEXT | |
| `avatar_url` | TEXT | S3 presigned URL |
| `role` | ENUM | `user`, `admin`, `superadmin` |
| `is_suspended` | BOOLEAN | Blocks all API access |
| `email_verified` | BOOLEAN | |
| `last_login_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated by trigger |

#### `teams`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Display name |
| `slug` | TEXT UNIQUE | URL-safe identifier |
| `owner_id` | UUID FK → users | Cannot be deleted while team exists |
| `plan` | TEXT | `free`, `pro`, `enterprise` |

#### `projects`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `team_id` | UUID FK → teams | |
| `name` | TEXT | |
| `status` | ENUM | `active`, `archived`, `deleted` |
| `color` | TEXT | Hex colour, shown in UI |
| `start_date`, `due_date` | DATE | Optional |

#### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID FK → projects | |
| `parent_id` | UUID FK → tasks | NULL for top-level, self-ref for subtasks |
| `title` | TEXT | Full-text indexed |
| `description` | TEXT | |
| `status` | ENUM | `todo`, `in_progress`, `in_review`, `done`, `cancelled` |
| `priority` | ENUM | `low`, `medium`, `high`, `critical` |
| `assignee_id` | UUID FK → users | SET NULL on user delete |
| `reporter_id` | UUID FK → users | |
| `due_date` | DATE | Indexed for due-date queries |
| `estimated_hrs` | NUMERIC(6,2) | |
| `actual_hrs` | NUMERIC(6,2) | |
| `position` | INTEGER | Ordering within status column |
| `tags` | TEXT[] | PostgreSQL array |

#### `audit_logs` (partitioned)
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `user_id` | UUID FK → users | NULL for anonymous requests |
| `action` | TEXT | e.g. `post:task`, `delete:project` |
| `resource` | TEXT | Resource type |
| `resource_id` | TEXT | UUID of affected resource |
| `meta` | JSONB | Path, query params, etc. |
| `ip_address` | INET | Client IP |
| `status` | TEXT | `success` or `failure` |
| `created_at` | TIMESTAMPTZ | Partition key |

Partitioned by `created_at` into monthly ranges. Add new partitions before month rollover.

### Indexes
```sql
-- Users
CREATE INDEX idx_users_email ON users (email);

-- Projects
CREATE INDEX idx_projects_team   ON projects (team_id);
CREATE INDEX idx_projects_status ON projects (status);

-- Tasks
CREATE INDEX idx_tasks_project  ON tasks (project_id);
CREATE INDEX idx_tasks_assignee ON tasks (assignee_id);
CREATE INDEX idx_tasks_status   ON tasks (status);
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_search   ON tasks USING GIN (
  to_tsvector('english', title || ' ' || COALESCE(description,''))
);

-- Notifications
CREATE INDEX idx_notifs_user_unread ON notifications (user_id, is_read)
  WHERE NOT is_read;

-- Audit logs
CREATE INDEX idx_audit_user   ON audit_logs (user_id);
CREATE INDEX idx_audit_action ON audit_logs (action, created_at DESC);
```

---

## 4. Security Layer

The security layer is **entirely custom-built** — no third-party auth services (Auth0, Cognito, etc.) are used. It consists of four cooperating components:

### 4.1 JWT Authentication (`auth.middleware.js`)

**Token design:**
- Access tokens: HS256, 15-minute TTL, carry `{ sub, role, jti }` claims
- Refresh tokens: HS256, 7-day TTL, same shape
- `jti` (JWT ID) is a UUID v4 included in every token

**Token lifecycle:**
```
Register/Login → issue (accessToken + refreshToken)
                       │
Every API request → verify accessToken (signature + expiry + blacklist check)
                       │
accessToken expires → POST /auth/refresh with refreshToken
                       │
                       ├── valid: issue new pair, blacklist old refreshToken JTI
                       └── reuse detected (JTI already blacklisted): revoke family, force re-login

Logout → blacklist accessToken JTI in Redis (TTL = remaining lifetime)
```

**Token blacklist (Redis):**
- Key pattern: `bl:<jti>` → `"1"` with TTL equal to token remaining lifetime
- Checked on every authenticated request
- Refresh token reuse detection: if a refreshToken's JTI is already blacklisted, a token theft is assumed — the server logs a warning and forces full re-login

**Fresh user fetch:**
Every authenticated request fetches the user from DB (not just from token claims) to enforce suspensions and deletions in real time. User objects are not cached to avoid stale state.

### 4.2 Rate Limiting (`rateLimiter.js`)

Three tiers, all Redis-backed for distributed enforcement across multiple ECS tasks:

| Limiter | Window | Limit | Key |
|---|---|---|---|
| Global | 15 min | **5 000 req** | Per IP |
| Auth | 15 min | 20 req | Per IP — brute-force guard |
| Write | 15 min | 200 req | Per user ID (falls back to IP) |

Additionally a **sliding window** limiter is available for per-route fine-grained control. Unlike fixed-window limiters, it uses a Redis sorted set (`ZADD` + `ZREMRANGEBYSCORE`) to accurately count requests in a rolling time window with no boundary-edge bursting.

All limiters return standard `RateLimit-*` headers and a structured JSON error on 429.

### 4.3 Input Sanitisation (`sanitize.js`)

Applied globally to `req.body`, `req.query`, and `req.params` before any controller logic:

1. **XSS prevention:** All string values are recursively passed through the `xss` library which strips or encodes dangerous HTML/JS constructs.
2. **Prototype pollution guard:** Keys `__proto__`, `constructor`, and `prototype` are stripped before object assignment.
3. **SQL injection heuristic:** A regex pattern detects common SQL injection signatures (`'`, `--`, `UNION SELECT`, `DROP TABLE`, etc.) and returns 400 before any DB query runs. Parameterised queries provide the primary SQL injection defence; this is a defence-in-depth layer.
4. **UUID validation:** A `validateUUID(paramName)` middleware factory validates route parameters against the UUID v4 format before handlers execute.

### 4.4 Audit Logging (`auditLog.middleware.js`)

Every `POST`, `PUT`, `PATCH`, `DELETE` request is logged to the `audit_logs` PostgreSQL table:
- Written asynchronously via `setImmediate` so it never adds latency to the response
- Captures: user ID, action, resource type, resource ID, HTTP method + path, client IP, success/failure status
- Failures are swallowed and logged to Winston — audit failures must never block API responses
- Table is range-partitioned by `created_at` for efficient archiving and querying

### 4.5 Transport & Headers (Helmet + CORS)

- **Helmet:** Sets `Content-Security-Policy`, `Strict-Transport-Security` (HSTS, 1 year), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`
- **CORS:** Origin whitelist enforced at the Express layer; credentials enabled only for allowed origins
- **TLS:** Terminated at ALB with TLSv1.2+ only; HTTP redirected to HTTPS; HSTS preloaded

### 4.6 RBAC — Role Hierarchy

**Platform roles** (stored on `users.role`):
```
superadmin > admin > user
```

**Project roles** (stored on `project_members.role`):
```
owner > admin > member > viewer
```

The `requireProjectMembership(minRole)` middleware factory checks membership and role hierarchy before any project-scoped operation. A user must pass both: be a platform `user` (not suspended) **and** hold the required project role.

---

## 5. Backend API Reference

### Base URL
```
https://api.nexus.io/api/v1
```

### Authentication
All protected endpoints require:
```
Authorization: Bearer <accessToken>
```

### Endpoints

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Create account, returns token pair |
| POST | `/auth/login` | — | Login, returns token pair |
| POST | `/auth/logout` | ✓ | Blacklist current access token |
| POST | `/auth/refresh` | — | Rotate token pair using refresh token |
| GET | `/auth/me` | ✓ | Current user profile |

**POST /auth/register**
```json
// Request
{ "email": "jane@acme.com", "password": "Secure123", "fullName": "Jane Smith" }

// Response 201
{
  "user": { "id": "uuid", "email": "jane@acme.com", "fullName": "Jane Smith" },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900
}
```

**POST /auth/refresh**
```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 900 }
```

#### Projects

| Method | Path | Auth | Min Role | Description |
|---|---|---|---|---|
| GET | `/projects` | ✓ | member | List my projects |
| POST | `/projects` | ✓ | — | Create project |
| GET | `/projects/:id` | ✓ | viewer | Get project detail |
| PATCH | `/projects/:id` | ✓ | admin | Update project |

#### Tasks

All task routes are nested under `/projects/:projectId/tasks`.

| Method | Path | Auth | Min Role | Description |
|---|---|---|---|---|
| GET | `/projects/:pid/tasks` | ✓ | viewer | List tasks (filterable, paginated) |
| POST | `/projects/:pid/tasks` | ✓ | member | Create task |
| GET | `/projects/:pid/tasks/:id` | ✓ | viewer | Get task detail |
| PATCH | `/projects/:pid/tasks/:id` | ✓ | member | Update task |
| DELETE | `/projects/:pid/tasks/:id` | ✓ | admin | Cancel task |

**Query parameters for GET /tasks:**
```
?status=todo|in_progress|in_review|done|cancelled
?priority=low|medium|high|critical
?assigneeId=<uuid>
?search=<text>          (full-text search via pg_trgm)
?page=1&limit=50
?sortBy=position|created_at|due_date|priority
?order=asc|desc
```

#### Teams

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/teams` | ✓ | List my teams |
| POST | `/teams` | ✓ | Create team |
| POST | `/teams/:id/invite` | ✓ (admin) | Invite member by email |
| DELETE | `/teams/:id/members/:uid` | ✓ | Remove member |

#### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users?search=` | ✓ | Search users |
| GET | `/users/:id` | ✓ | Get user profile |
| PATCH | `/users/:id` | ✓ (self/admin) | Update profile |
| POST | `/users/:id/change-password` | ✓ (self) | Change password |
| PATCH | `/users/:id/suspend` | ✓ (admin) | Suspend/reinstate user |

### Error Response Format
```json
{
  "error": "Human-readable message",
  "statusCode": 422,
  "code": "VALIDATION_ERROR",        // optional machine-readable code
  "errors": [                        // optional field-level errors
    { "field": "email", "msg": "Invalid email" }
  ]
}
```

### WebSocket Protocol

Connect: `wss://api.nexus.io/ws?token=<accessToken>`

**Client → Server messages:**
```json
{ "type": "join",  "projectId": "<uuid>" }
{ "type": "leave", "projectId": "<uuid>" }
{ "type": "ping" }
```

**Server → Client messages:**
```json
{ "type": "joined",       "projectId": "<uuid>" }
{ "type": "pong" }
{ "type": "task:created", "projectId": "<uuid>", "task": { ... } }
{ "type": "task:updated", "projectId": "<uuid>", "task": { ... } }
{ "type": "notification", "data": { ... } }
```

---

## 6. Frontend Module

### Technology Stack

| Package | Version | Purpose |
|---|---|---|
| React | 18.2 | UI rendering |
| React Router | 6.x | Client-side routing |
| TanStack Query | 5.x | Server state, caching, background refresh |
| Zustand | 4.x | Client state (auth) |
| Axios | 1.x | HTTP client with interceptors |
| Tailwind CSS | 3.x | Utility-first styling |
| Vite | 5.x | Build tool and dev server |

### State Architecture

```
AuthStore (Zustand, persisted)
├── user: { id, email, fullName, role }
├── accessToken: string | null       ← never persisted (memory only)
├── refreshToken: string | null      ← persisted to localStorage
└── isAuthenticated: boolean

ServerState (TanStack Query, in-memory cache)
├── ['projects']           → GET /projects
├── ['project', id]        → GET /projects/:id
└── ['tasks', projectId]   → GET /projects/:id/tasks
```

### JWT Refresh Flow (Axios Interceptor)

```
Request → attach Bearer token
             │
         Response 401?
             │
         isRefreshing?  ── YES → queue request → wait for new token
             │
            NO → set isRefreshing=true
                  POST /auth/refresh
                  ├── success → update store → reprocess queue → retry original
                  └── failure → clear auth state → redirect to /login
```

### Route Structure

```
/                           → redirect /dashboard
/login                      GuestRoute (redirect if authenticated)
/register                   GuestRoute
/dashboard                  ProtectedRoute → DashboardLayout
  /dashboard                ProjectsPage (index)
  /dashboard/projects/:id   ProjectBoard (Kanban)
  /dashboard/profile        ProfilePage
```

### Component Hierarchy

```
App
└── DashboardLayout
    ├── Sidebar (nav, project list, user avatar)
    └── Outlet
        ├── ProjectsPage
        │   └── CreateProjectModal
        ├── ProjectBoard
        │   ├── Column (×4: todo / in_progress / in_review / done)
        │   │   ├── TaskCard (click to expand, inline status change)
        │   │   └── CreateTaskForm (inline quick-add)
        │   └── useWebSocket (live task updates)
        └── ProfilePage
```

---

## 7. Cloud Infrastructure

### AWS Services Used

| Service | Purpose | Config |
|---|---|---|
| **ECS Fargate** | Backend compute | 512 CPU / 1024 MB RAM, auto-scales 1–10 |
| **RDS PostgreSQL 15** | Primary database | `db.t3.medium`, Multi-AZ in prod |
| **ElastiCache Redis 7** | Cache + rate limiting | `cache.t3.small` |
| **S3** | Frontend assets + file attachments | Versioned, AES-256 encrypted |
| **CloudFront** | CDN for frontend | TLSv1.2+, HTTP→HTTPS redirect |
| **ALB** | Load balancer + TLS termination | Two public subnets, health checks |
| **WAFv2** | Web application firewall | AWS managed rule sets + IP rate limit |
| **ACM** | TLS certificates | Auto-renewed |
| **Route 53** | DNS + health-check failover | |
| **ECR** | Docker image registry | |
| **CloudWatch** | Logs + metrics + alarms | 30-day retention |
| **SSM Parameter Store** | Secrets management | SecureString (KMS-encrypted) |

### VPC Layout

```
VPC 10.0.0.0/16
├── Public Subnet 1  (10.0.1.0/24)  AZ-a  ← ALB, NAT Gateway
├── Public Subnet 2  (10.0.2.0/24)  AZ-b  ← ALB
├── Private Subnet 1 (10.0.11.0/24) AZ-a  ← ECS tasks, RDS primary
└── Private Subnet 2 (10.0.12.0/24) AZ-b  ← ECS tasks, RDS standby
```

Security group rules follow **least-privilege**:
- ALB accepts 80/443 from `0.0.0.0/0`
- ECS tasks accept 3001 **only from ALB security group**
- RDS accepts 5432 **only from ECS security group**
- Redis accepts 6379 **only from ECS security group**

### Secrets Management

Secrets are stored in **AWS SSM Parameter Store** as `SecureString` (KMS-encrypted) and injected into ECS containers at runtime via task definition `secrets` references — they are **never** stored in environment files, Docker images, or source code.

Required SSM parameters:
```
/nexus/DB_PASSWORD
/nexus/JWT_ACCESS_SECRET
/nexus/JWT_REFRESH_SECRET
/nexus/REDIS_PASSWORD
/nexus/SMTP_PASS
```

---

## 8. Performance & Scalability

### Meeting the 5000 API Hits Requirement

The 5000 req/15-min global rate limit is designed to match the requirement. The infrastructure can sustain far higher throughput:

| Layer | Capacity |
|---|---|
| CloudFront edge | Millions of req/s for static assets |
| ALB | 100 000+ req/s |
| ECS (2 tasks × 512 CPU) | ~400 req/s sustained at p95 < 200ms |
| Auto-scaling (up to 10 tasks) | ~2 000 req/s |
| PostgreSQL RDS (db.t3.medium) | ~500 concurrent connections |
| Redis ElastiCache | ~100 000 ops/s |

**Connection pool tuning** (`database.js`):
- Pool min: 5, max: 20 per ECS task
- At 10 tasks: up to 200 total DB connections
- RDS `max_connections` should be set to `250` with `pgBouncer` added for production scale beyond 10 tasks

### Caching Strategy

| Data | Cache | TTL |
|---|---|---|
| Rate limit counters | Redis `rl:*` keys | 15 min (window) |
| Token blacklist | Redis `bl:*` keys | Token remaining lifetime |
| Static frontend assets | CloudFront | 1 year (cache-busted by hash) |
| `index.html` | CloudFront | `no-cache` (always revalidate) |

### Query Optimisation

- Full-text search uses GIN index with `to_tsvector` — avoids `LIKE '%query%'` scans
- Due-date queries use partial index (only rows where `due_date IS NOT NULL`)
- Audit logs partitioned by month — old-partition queries never scan current data
- `position` column enables O(1) Kanban reordering without full-table sorts

---

## 9. Development Setup

### Prerequisites

- Docker Desktop 4.x+
- Node.js 20+ (for running outside Docker)
- AWS CLI (for deployment)

### Quick Start (Docker Compose)

```bash
# 1. Clone repository
git clone https://github.com/your-org/nexus.git
cd nexus

# 2. Start all services (PostgreSQL, Redis, Backend, Frontend)
docker compose up --build

# 3. Access
#    Frontend:  http://localhost:5173
#    API:       http://localhost:3001
#    API health: http://localhost:3001/health
```

Docker Compose automatically:
- Runs SQL migrations via `docker-entrypoint-initdb.d`
- Sets all environment variables
- Enables hot-reload for both backend (nodemon) and frontend (Vite HMR)

### Running Without Docker

```bash
# Terminal 1 — PostgreSQL (or use local install)
docker run -e POSTGRES_DB=nexus_db -e POSTGRES_USER=nexus_app \
  -e POSTGRES_PASSWORD=devpassword123 -p 5432:5432 postgres:15-alpine

# Terminal 2 — Redis
docker run -p 6379:6379 redis:7-alpine

# Terminal 3 — Backend
cd backend
cp .env.example .env       # edit values
npm install
npm run migrate            # apply SQL migrations
npm run dev

# Terminal 4 — Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Environment Variables

See `backend/.env.example` and `frontend/.env.example` for all required variables.

**Critical secrets to generate:**
```bash
# Generate 64-byte JWT secrets
openssl rand -hex 64   # JWT_ACCESS_SECRET
openssl rand -hex 64   # JWT_REFRESH_SECRET
```

---

## 10. Deployment Guide

### Initial Infrastructure Provisioning

```bash
# 1. Create ECR repository
aws ecr create-repository --repository-name nexus-backend --region us-east-1

# 2. Store secrets in SSM Parameter Store
aws ssm put-parameter --name /nexus/DB_PASSWORD          --value "<secret>" --type SecureString
aws ssm put-parameter --name /nexus/JWT_ACCESS_SECRET    --value "<secret>" --type SecureString
aws ssm put-parameter --name /nexus/JWT_REFRESH_SECRET   --value "<secret>" --type SecureString

# 3. Request ACM certificate (must be in us-east-1 for CloudFront)
aws acm request-certificate --domain-name app.nexus.io \
  --validation-method DNS --region us-east-1

# 4. Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file infra/cloudformation.yaml \
  --stack-name nexus-prod \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    DBPassword=<strong_password> \
    DomainName=app.nexus.io \
    CertificateArn=arn:aws:acm:us-east-1:... \
    BackendImage=<ecr_uri>:latest

# 5. Run database migrations
aws ecs run-task --cluster nexus-prod \
  --task-definition nexus-backend \
  --overrides '{"containerOverrides":[{"name":"backend","command":["node","-e","require(\"./migrations/run\"))"]}]}'
```

### Ongoing Deployments (CI/CD)

Push to `main` branch triggers the GitHub Actions pipeline automatically:
1. Tests run against ephemeral PostgreSQL + Redis (GitHub-hosted services)
2. Docker image built, tagged with commit SHA, pushed to ECR
3. ECS task definition updated with new image, deployed with rolling update (50% min healthy)
4. Frontend Vite build deployed to S3, CloudFront cache invalidated

### Rollback

```bash
# ECS: redeploy previous task definition revision
aws ecs update-service --cluster nexus-prod --service nexus-backend \
  --task-definition nexus-backend:<previous_revision>

# Frontend: re-sync previous build from Git, or restore S3 versioned objects
```

---

## 11. Monitoring & Observability

### Structured Logging (Winston)

All logs are written as JSON in production and streamed to CloudWatch Logs (`/ecs/nexus-backend`).

Log levels:
- `error` — unhandled exceptions, DB errors, audit write failures
- `warn` — rate limit hits, RBAC denials, slow queries (>1s), WS errors
- `info` — startup, shutdown, DB/Redis connection events
- `debug` — WS connect/disconnect (disabled in production)

### CloudWatch Alarms (recommended)

```
ALB 5XX rate       > 1%       for 5 min → PagerDuty
ECS CPU util       > 80%      for 5 min → scale-out
ECS task count     < 1        for 1 min → page immediately
RDS connections    > 200                → investigate pool sizing
Redis memory       > 80%               → upgrade instance
Rate limit hits    > 100/min            → security review
```

### Health Check

`GET /health` returns:
```json
{ "status": "ok", "ts": 1703123456789 }
```

ALB health checks hit this endpoint every 30s. ECS replaces unhealthy tasks automatically.

---

## 12. Security Hardening Checklist

- [x] JWT access tokens expire in 15 minutes
- [x] Refresh token rotation with reuse detection
- [x] Token blacklist in Redis on logout
- [x] Bcrypt password hashing (12 rounds)
- [x] Timing-safe login (bcrypt always runs regardless of user existence)
- [x] RBAC enforced at every protected route
- [x] Rate limiting on all endpoints, stricter on auth
- [x] XSS sanitisation on all inputs
- [x] Prototype pollution protection
- [x] SQL injection heuristic + parameterised queries exclusively
- [x] UUID format validation on all ID params
- [x] HSTS with 1-year max-age and preload
- [x] Content Security Policy blocking inline scripts
- [x] CORS whitelist enforced at Express layer
- [x] Stack traces never returned in production responses
- [x] Secrets in SSM Parameter Store, never in source or images
- [x] RDS encrypted at rest (AES-256), TLS in transit
- [x] S3 buckets block all public access except CloudFront OAC
- [x] ECS tasks run as non-root user (UID 1001)
- [x] VPC private subnets for all backend resources
- [x] WAF protects ALB with AWS managed rule sets
- [x] Security groups follow least-privilege (no `0.0.0.0/0` on DB/cache)
- [x] Immutable audit trail for all mutating operations
- [x] Account suspension enforced on every authenticated request (not just login)

---

*Generated for Nexus v1.0.0 — last updated March 2026*
