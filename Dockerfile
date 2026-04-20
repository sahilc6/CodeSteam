# ─────────────────────────────────────────────────────────────────────────────
#  Stage 1: build the React client
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS client-builder
WORKDIR /build/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
# Build args allow overriding API URLs at build time
ARG VITE_API_URL=""
ARG VITE_WS_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
#  Stage 2: production server base (language runtimes for code execution)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime-base

# Install all language runtimes needed by the sandbox
RUN apk add --no-cache \
    python3 \
    py3-pip \
    su-exec \
    gcc \
    g++ \
    make \
    musl-dev \
    go \
    rust \
    ruby \
    php83 \
    bash \
    docker-cli \
    openjdk17 \
    # Security hardening
    && addgroup -S appgroup \
    && adduser  -S appuser -G appgroup \
    && addgroup -S sandbox \
    && adduser  -S sandbox -G sandbox \
    && npm install -g typescript ts-node \
    && ln -sf /sbin/su-exec /usr/local/bin/su-exec \
    && if command -v php83 >/dev/null 2>&1 && ! command -v php >/dev/null 2>&1; then ln -s /usr/bin/php83 /usr/bin/php; fi \
    # Clean apk cache
    && rm -rf /var/cache/apk/*

# ─────────────────────────────────────────────────────────────────────────────
#  Stage 3: install production Node deps only
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS deps
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# ─────────────────────────────────────────────────────────────────────────────
#  Stage 4: final production image
# ─────────────────────────────────────────────────────────────────────────────
FROM runtime-base AS production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# Copy server source + deps
COPY --from=deps         /app/node_modules ./node_modules
COPY server/src          ./src

# Copy built React app into /app/public (served by Nginx, not Express)
# We expose the path so docker-compose can reference it
COPY --from=client-builder /build/client/dist ./public

# Create logs dir with correct ownership and keep app files private from sandbox user
RUN mkdir -p /app/logs \
    && chown -R appuser:appgroup /app \
    && chmod -R o-rwx /app

# Keep the server process able to drop submitted code to the sandbox user.
# The app files are private to appuser/root, so sandboxed code cannot read them.
USER root

EXPOSE 5000

# Graceful shutdown: use dumb-init to forward signals properly
# (alpine ships with it via apk, but we'll use node's built-in signal handling)
CMD ["node", "src/index.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
