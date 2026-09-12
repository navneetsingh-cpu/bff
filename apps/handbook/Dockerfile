# syntax=docker/dockerfile:1
#
# Build context is the REPO ROOT, not apps/handbook.
#   docker build -f apps/handbook/Dockerfile .
#
# It has to be the root because this is an npm workspace: the lockfile and the
# shared packages/ live above this app, and the build needs all of them.
#
# Four stages. Only two ever become a running container:
#   base    -> common setup every stage below starts from
#   deps    -> npm ci, cached
#   dev     -> what `docker compose up` runs (hot reload)
#   runner  -> what production runs (small, no source, non-root)

# ---------------------------------------------------------------------------
# base — the shared starting point. Every stage below begins `FROM base`, so
# these four lines are written once instead of four times.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
# Alpine ships musl, not glibc. Next's SWC compiler is a native binary that
# expects glibc, so without this shim the build dies with "libc.so.6 not found".
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
# deps — install node_modules, and nothing else.
#
# Only manifests and the lockfile are copied, never source. That's the whole
# point: Docker caches this layer and re-runs `npm ci` only when a package.json
# or the lockfile changes. Editing a .tsx file reuses the cached install.
#
# Every workspace manifest has to be here, including the ones this app doesn't
# import. `npm ci` resolves the entire workspace graph from the root lockfile,
# so a missing package.json fails the install.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/bff/package.json ./apps/bff/
COPY apps/connect/package.json ./apps/connect/
COPY apps/iif/package.json ./apps/iif/
COPY apps/handbook/package.json ./apps/handbook/
COPY packages/internal-auth/package.json ./packages/internal-auth/
COPY packages/session-sync/package.json ./packages/session-sync/
# @internal/ui — the shared header and cross-zone nav, used by all three sub-apps.
#
# Shared as SOURCE, not as a built package. It has no build script and no dist/:
# its package.json points "main" straight at src/index.ts. `npm ci` links
# node_modules/@internal/ui as a symlink to packages/ui, so there is exactly one
# copy in the repo and each app compiles the .tsx itself during its own build.
#
# Only the manifest is copied here. The actual .tsx arrives with `COPY . .` in
# the builder stage below.
COPY packages/ui/package.json ./packages/ui/
RUN npm ci

# ---------------------------------------------------------------------------
# dev — the container `docker compose up` starts.
#
# The `COPY . .` here is only a starting point: compose bind-mounts apps/handbook
# and packages/ over the top, so the files you edit on your machine are the
# files running inside. Save a file and Next hot-reloads it. Edit the shared
# header in packages/ui and all three sub-apps pick it up, because compose
# mounts that directory into each of them.
#
# Runs as root, unlike runner — it needs to write .next/ into a mounted volume.
# Fine for local dev, never for production. Same as apps/bff/Dockerfile.
# ---------------------------------------------------------------------------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@bff/handbook"]

# ---------------------------------------------------------------------------
# builder — compile the app. This stage is thrown away; only its output ships.
#
# `COPY . .` brings in the real source this time, including packages/ui.
# That package ships raw .tsx rather than compiled JS (see its package.json:
# "main": "./src/index.ts"), so Next compiles it as part of this app's build.
# That is what `transpilePackages` in next.config.js is for — without it, Next
# would hand the header's TSX straight to node and choke on the syntax.
#
# `next build` with `output: 'standalone'` writes a self-contained server plus
# only the node_modules actually reached at runtime.
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY . .
RUN npm run build --workspace=apps/handbook

# ---------------------------------------------------------------------------
# runner — the production image. Starts clean from base and copies in only the
# three build outputs: no source, no npm, no dev dependencies, no build tools.
#
# Note it copies from `builder`, not from `deps` — the standalone output already
# contains the node_modules it needs, so node_modules is never copied directly.
# The shared UI package is inside that output because next.config.js names it in
# `outputFileTracingIncludes`; it is compiled into the app rather than imported
# at runtime, so Next's tracer cannot see it on its own.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The server itself, plus its traced node_modules.
COPY --from=builder --chown=node:node /app/apps/handbook/.next/standalone ./
# JS/CSS bundles. Not part of standalone — they are served, not executed.
COPY --from=builder --chown=node:node /app/apps/handbook/.next/static ./apps/handbook/.next/static
# Anything in public/ (images, fonts, favicon).
COPY --from=builder --chown=node:node /app/apps/handbook/public ./apps/handbook/public

# Drop root. From here the process cannot write to its own image.
USER node
# Documentation only — the port is published by docker-compose, not by this.
EXPOSE 3000
# Plain node, no npm. One less process, and npm isn't in this image anyway.
CMD ["node", "apps/handbook/server.js"]
