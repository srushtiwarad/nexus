# ⚡ Nexus — Project Management SaaS

A production-grade, cloud-native project and task management application.

## Stack
- **Backend:** Node.js + Express, PostgreSQL 15, Redis 7, WebSockets
- **Frontend:** React 18, TanStack Query, Zustand, Tailwind CSS, Vite
- **Security:** Custom JWT auth, Redis rate limiting, RBAC, audit logging, XSS/SQLi sanitisation
- **Infrastructure:** AWS ECS Fargate + RDS + ElastiCache + CloudFront (CloudFormation IaC)
- **CI/CD:** GitHub Actions → ECR → ECS + S3/CloudFront

## Quick Start

```bash
docker compose up --build
# Frontend: http://localhost:5173
# API:      http://localhost:3001
```

## Documentation

See [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) for:
- Full system architecture
- Data models (ERD)
- Security layer design
- Complete API reference
- Infrastructure guide
- Deployment instructions

## Project Structure

```
nexus/
├── backend/          Node.js API (Express)
├── frontend/         React SPA (Vite)
├── infra/            CloudFormation IaC
├── docs/             Full documentation
└── docker-compose.yml
```
