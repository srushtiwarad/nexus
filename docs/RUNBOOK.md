# Nexus Deployment Runbook

> Operational procedures for deploying, maintaining, and recovering Nexus in production.

---

## 1. Pre-Deployment Checklist

Run before every production deployment:

- [ ] All CI tests pass on the PR branch
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] DB migration files reviewed — are they backward-compatible?
- [ ] Environment variables verified in SSM Parameter Store
- [ ] CloudWatch alarms are not currently firing
- [ ] At least one ECS task is healthy before deploying (rolling update needs a baseline)
- [ ] Notify team in `#deployments` Slack channel

---

## 2. Standard Deployment (CI/CD)

Push to `main` triggers GitHub Actions automatically:

```
push to main
  → test job (PostgreSQL + Redis services)
  → build-and-push job (Docker → ECR)
  → deploy-backend job (ECS rolling update)
  → deploy-frontend job (Vite build → S3 → CloudFront invalidation)
```

Monitor progress: GitHub Actions → `Deploy Nexus` workflow.

Expected deployment time: **8–12 minutes** end-to-end.

---

## 3. Manual Backend Deployment

Use when CI/CD is unavailable or for hotfixes:

```bash
# Build and push image
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t nexus-backend:hotfix ./backend
docker tag nexus-backend:hotfix 123456789.dkr.ecr.us-east-1.amazonaws.com/nexus-backend:hotfix
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/nexus-backend:hotfix

# Update task definition (replace image URI)
aws ecs register-task-definition \
  --cli-input-json file://infra/task-definition.json

# Deploy new revision
aws ecs update-service \
  --cluster nexus-prod \
  --service nexus-backend \
  --task-definition nexus-backend:<new_revision> \
  --force-new-deployment

# Watch deployment
aws ecs wait services-stable --cluster nexus-prod --services nexus-backend
echo "Deployment stable"
```

---

## 4. Database Migrations

Migrations **must** be backward-compatible — the old code runs against the new schema during rolling update.

**Safe patterns:**
- Add nullable columns (old code ignores them)
- Add new tables (old code doesn't query them)
- Add indexes (non-blocking with `CREATE INDEX CONCURRENTLY`)

**Unsafe patterns (require maintenance window):**
- Rename columns
- Change column types
- Drop columns that old code still reads

```bash
# Run migration via one-off ECS task
aws ecs run-task \
  --cluster nexus-prod \
  --launch-type FARGATE \
  --task-definition nexus-backend \
  --overrides '{
    "containerOverrides": [{
      "name": "backend",
      "command": ["psql", "$DATABASE_URL", "-f", "/app/migrations/002_seed_and_indexes.sql"]
    }]
  }' \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxx", "subnet-yyy"],
      "securityGroups": ["sg-xxx"],
      "assignPublicIp": "DISABLED"
    }
  }'
```

---

## 5. Rollback Procedures

### Backend rollback (< 5 minutes)

```bash
# List recent task definition revisions
aws ecs list-task-definitions --family-prefix nexus-backend --sort DESC --max-items 5

# Roll back to previous revision
aws ecs update-service \
  --cluster nexus-prod \
  --service nexus-backend \
  --task-definition nexus-backend:<previous_revision>

aws ecs wait services-stable --cluster nexus-prod --services nexus-backend
```

### Frontend rollback

```bash
# Identify the previous deploy by Git commit SHA
git log --oneline -5

# Re-run the frontend deploy step for that commit
git checkout <previous_sha>
cd frontend && npm ci && npm run build
aws s3 sync dist/ s3://<FRONTEND_BUCKET> --delete
aws cloudfront create-invalidation \
  --distribution-id <DIST_ID> --paths "/*"
```

### Database rollback

Only possible if the migration was additive. Destructive migrations cannot be automatically rolled back — restore from RDS snapshot:

```bash
# List available snapshots
aws rds describe-db-snapshots --db-instance-identifier nexus-prod-postgres

# Restore (creates a new instance)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier nexus-prod-postgres-restored \
  --db-snapshot-identifier <snapshot-id>
```

---

## 6. Scaling

### Manual scale-out (traffic spike)

```bash
aws ecs update-service \
  --cluster nexus-prod \
  --service nexus-backend \
  --desired-count 5
```

### Auto-scaling is configured

- Scale-out: CPU > 70% for 1 min → add 1 task (cooldown 60s)
- Scale-in: CPU < 30% for 5 min → remove 1 task (cooldown 300s)
- Range: 1–10 tasks

---

## 7. Secrets Rotation

```bash
# Generate new JWT secret
NEW_SECRET=$(openssl rand -hex 64)

# Update in SSM
aws ssm put-parameter \
  --name /nexus/JWT_ACCESS_SECRET \
  --value "$NEW_SECRET" \
  --type SecureString \
  --overwrite

# Force ECS task replacement to pick up new secret
aws ecs update-service \
  --cluster nexus-prod \
  --service nexus-backend \
  --force-new-deployment
```

⚠️ Rotating JWT secrets invalidates all existing access tokens. Users will need to log in again. Schedule during low-traffic window.

---

## 8. Incident Response

### API returning 5xx errors

1. Check CloudWatch Logs: `/ecs/nexus-backend` — look for stack traces
2. Check ECS service events: `aws ecs describe-services --cluster nexus-prod --services nexus-backend`
3. Check RDS connectivity: query `SELECT 1` from a bastion host
4. Check Redis connectivity: `redis-cli -h <REDIS_ENDPOINT> ping`
5. If recent deployment → rollback (see §5)

### Database connection exhaustion

```bash
# Check current connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections older than 10 minutes
psql $DATABASE_URL -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND query_start < NOW() - INTERVAL '10 minutes'
    AND datname = 'nexus_db';"
```

Long-term fix: add PgBouncer connection pooler in front of RDS.

### Redis memory full

```bash
# Check memory usage
redis-cli -h <REDIS_ENDPOINT> INFO memory | grep used_memory_human

# Flush rate limit keys (safe — they auto-expire)
redis-cli -h <REDIS_ENDPOINT> --scan --pattern 'rl:*' | xargs redis-cli del

# Upgrade to larger ElastiCache node type if recurring
```

---

## 9. Health Check URLs

| Service | URL |
|---|---|
| API health | `https://api.nexus.io/health` |
| Frontend | `https://app.nexus.io` |
| ALB target group | AWS Console → EC2 → Target Groups → nexus-backend-tg |

---

## 10. On-Call Contacts

Update this section with your team's contacts. Incidents should be routed through PagerDuty with escalation policy:
1. On-call engineer (15 min)
2. Backend lead (30 min)
3. CTO (60 min)
