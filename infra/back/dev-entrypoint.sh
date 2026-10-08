#!/bin/sh
# Entrypoint del back en el entorno local (infra/docker-compose.dev.yml). Solo desarrollo.
set -eu

cd /app

# 1. node_modules vive en un volumen (para no pisarlo con el del host al montar el código).
#    Si package-lock.json cambió desde que se llenó el volumen, se reinstala.
stamp=node_modules/.package-lock.sha256
if ! sha256sum -c "$stamp" >/dev/null 2>&1; then
  echo "[dev-entrypoint] package-lock.json cambió: npm ci"
  npm ci
  sha256sum package-lock.json > "$stamp"
fi

# 2. JWT_SECRET de desarrollo, NO secreto, solo si no vino de back-service/.env
#    (permite `docker compose up` sin haber corrido `task setup`). Nunca usar fuera de local.
if [ -z "${JWT_SECRET:-}" ]; then
  echo "[dev-entrypoint] AVISO: JWT_SECRET vacío; se usa uno de desarrollo inseguro. Corré 'task setup'."
  export JWT_SECRET="dev-only-insecure-jwt-secret-do-not-use-anywhere-else"
fi

exec "$@"
