# Multi-stage build for the NestJS API/worker. Node 22 (AWS SDK v3 wants >=22).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
EXPOSE 3000
# Liveness handled by the orchestrator hitting /healthz.
CMD ["node", "dist/main.js"]
