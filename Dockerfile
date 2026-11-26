FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && chown node:node /app \
    && install -d -o node -g node /data

USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN DATABASE_URL=file:/tmp/build.db ./node_modules/.bin/prisma generate \
    && DATABASE_URL=file:/tmp/build.db SESSION_SECRET=build-only npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["./node_modules/.bin/tsx", "server.ts"]
