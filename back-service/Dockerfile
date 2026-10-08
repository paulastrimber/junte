# syntax=docker/dockerfile:1
# Imagen del back service. Targets:
#   dev  → la usa infra/docker-compose.dev.yml (código montado como volumen, `npm run dev`).
#   prod → propuesta para AWS (ver docs/pendientes.md, sección C · infra local + Nginx).
ARG NODE_IMAGE=node:22.23.3-trixie-slim

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
EXPOSE 3000

# ── dev ──────────────────────────────────────────────────────────────
FROM base AS dev
ENV NODE_ENV=development
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
# El hash del lockfile permite al entrypoint de dev detectar que el volumen de node_modules
# quedó viejo (ver infra/back/dev-entrypoint.sh).
RUN npm ci \
 && sha256sum package-lock.json > node_modules/.package-lock.sha256
COPY --chown=node:node . .
CMD ["npm", "run", "dev"]

# ── prod ─────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Código de solo lectura para el usuario que corre el proceso.
COPY . .
USER node
CMD ["node", "src/server.js"]
