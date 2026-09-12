# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not apps/iif.
#   docker build -f apps/iif/Dockerfile .

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
RUN npm ci

# ---------------------------------------------------------------------------
# dev — source arrives via bind mount. Root user; see apps/bff/Dockerfile.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@bff/iif"]

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY . .
RUN npm run build --workspace=@bff/iif

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/iif/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/iif/.next/static ./apps/iif/.next/static
COPY --from=builder --chown=node:node /app/apps/iif/public ./apps/iif/public

USER node
EXPOSE 3000
CMD ["node", "apps/iif/server.js"]
