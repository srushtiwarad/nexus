# ============================================================
# nexus/backend/Dockerfile
# Multi-stage build: build → production image (~120 MB)
# ============================================================

# ── Stage 1: dependencies ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ── Stage 2: production image ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nexus

# Copy production deps and source
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nexus:nodejs . .

# Create log directory
RUN mkdir -p /var/log/nexus && chown nexus:nodejs /var/log/nexus

USER nexus

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/server.js"]
