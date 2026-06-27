FROM node:22-alpine AS base
WORKDIR /app

# ── Backend dependencies ─────────────────────────────────────────────────────
FROM base AS backend-deps
COPY package*.json ./
RUN npm ci --omit=dev

# ── Frontend build ────────────────────────────────────────────────────────────
FROM base AS frontend-build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY --from=backend-deps /app/node_modules ./node_modules
COPY --from=frontend-build /app/public ./public
COPY package*.json ./
COPY src/ ./src/
COPY config/ ./config/

# SQLite data directory (mount a volume here in production)
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
