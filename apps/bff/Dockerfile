# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not apps/bff — npm workspaces need the root
# package.json, the root lockfile and the shared packages to resolve anything.
#
#   docker build -f apps/bff/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps — the layer worth caching.
#
# Only manifests and the lockfile are copied here, so this layer is reused on
# every build where no dependency changed, no matter how much source churned.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/bff/package.json ./apps/bff/
COPY apps/connect/package.json ./apps/connect/
COPY apps/iif/package.json ./apps/iif/
COPY apps/handbook/package.json ./apps/handbook/
COPY packages/internal-auth/package.json ./packages/internal-auth/
COPY packages/session-sync/package.json ./packages/session-sync/
RUN npm ci

# ---------------------------------------------------------------------------
# dev — `docker compose up` target. Source arrives via bind mount, not COPY.
#
# Runs as root on purpose: the bind-mounted workspace and the .next volume are
# created by the daemon, and matching uids across Windows/macOS/Linux hosts is
# more trouble than it's worth for a dev container. The runner stage below is
# the one that ships, and it does not run as root.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@bff/bff"]

# ---------------------------------------------------------------------------
# builder — produces .next/standalone
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY . .
RUN npm run build --workspace=@bff/bff

# ---------------------------------------------------------------------------
# runner — no source, no npm, no dev dependencies. Just the traced output.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `output: 'standalone'` emits a minimal monorepo tree with its own server.js.
# Static assets and public/ are not traced and have to be copied alongside it.
COPY --from=builder --chown=node:node /app/apps/bff/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/bff/.next/static ./apps/bff/.next/static
COPY --from=builder --chown=node:node /app/apps/bff/public ./apps/bff/public

USER node
EXPOSE 3000
CMD ["node", "apps/bff/server.js"]
