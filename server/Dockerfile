# Multi-stage build for the NestJS API/worker. Node 22 (AWS SDK v3 wants >=22).
#
# Build context is the REPO ROOT (see docker-compose.prod.yml: build.context: ..),
# because the server depends on the local package @mth/shared-domain via
# file:../packages/shared-domain, which lives OUTSIDE server/. We reproduce the
# monorepo layout (/repo/server + /repo/packages/shared-domain) so the file: link
# resolves. The shared package ships a committed dist, so no build is needed for it.
FROM node:22-alpine AS build
WORKDIR /repo

# Shared package: manifest + committed dist + src (src is needed for the server's
# tsconfig `paths` -> ../packages/shared-domain/src during nest build).
COPY packages/shared-domain/package.json packages/shared-domain/tsconfig.json ./packages/shared-domain/
COPY packages/shared-domain/dist ./packages/shared-domain/dist
COPY packages/shared-domain/src ./packages/shared-domain/src

# Install server deps (resolves file:../packages/shared-domain).
COPY server/package.json server/package-lock.json ./server/
WORKDIR /repo/server
RUN npm ci

# Server source + build (node_modules is excluded by .dockerignore, so this
# COPY does not clobber the installed deps).
COPY server/ ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Shared package at runtime: the node_modules symlink points to ../packages/
# shared-domain, and node resolves its main -> dist/index.js.
COPY packages/shared-domain/package.json ./packages/shared-domain/
COPY packages/shared-domain/dist ./packages/shared-domain/dist

COPY server/package.json server/package-lock.json ./server/
WORKDIR /repo/server
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/db ./db
COPY --from=build /repo/server/scripts ./scripts
COPY --from=build /repo/server/data ./data

EXPOSE 3000
# Liveness handled by the orchestrator hitting /healthz.
CMD ["node", "dist/main.js"]
