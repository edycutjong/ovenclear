# OvenClear storefront — Cloud Run image.
#
# Runs the TypeScript sources directly through tsx rather than emitting a build:
# the module graph uses extensionless ESM imports that plain node cannot resolve,
# and a loader is both smaller and less to get wrong than a bundler step for a
# service this size.

FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first so a source-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY server ./server
COPY verify ./verify

# Cloud Run sends SIGTERM; node as PID 1 handles it (see the shutdown hook in
# server/index.ts). No shell wrapper, so the signal is not swallowed.
USER node
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
