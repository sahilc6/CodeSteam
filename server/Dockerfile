FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=5000 \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

WORKDIR /app

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
    openjdk17-jdk

RUN addgroup -S sandbox \
    && adduser -S sandbox -G sandbox \
    && npm install -g typescript ts-node \
    && ln -sf /sbin/su-exec /usr/local/bin/su-exec \
    && if command -v php83 >/dev/null 2>&1 && ! command -v php >/dev/null 2>&1; then ln -s /usr/bin/php83 /usr/bin/php; fi

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

COPY src ./src

EXPOSE 5000

CMD ["node", "src/index.js"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
