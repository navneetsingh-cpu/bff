# syntax=docker/dockerfile:1
# Build context is the repository root: docker build -f apps/bff/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependencies ---------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/bff/package.json apps/bff/
COPY apps/app-hr/package.json apps/app-hr/
COPY apps/app-ops/package.json apps/app-ops/
COPY packages/internal-auth/package.json packages/internal-auth/
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /repo ./
COPY . .
RUN pnpm --filter bff build

# ---- runtime --------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /repo

# Standalone output already contains the pruned node_modules tree.
COPY --from=builder --chown=node:node /repo/apps/bff/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/bff/.next/static ./apps/bff/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "apps/bff/server.js"]
