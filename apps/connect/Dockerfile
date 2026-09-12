# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not apps/connect.
#   docker build -f apps/connect/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps — manifests and lockfile only, so the install layer caches across builds.
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
# dev — source arrives via bind mount. Root user; see apps/bff/Dockerfile.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@bff/connect"]

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY . .
RUN npm run build --workspace=@bff/connect

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/connect/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/connect/.next/static ./apps/connect/.next/static
COPY --from=builder --chown=node:node /app/apps/connect/public ./apps/connect/public

USER node
EXPOSE 3000
CMD ["node", "apps/connect/server.js"]
