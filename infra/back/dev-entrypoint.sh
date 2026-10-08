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

# JWT_SECRET y el resto de las variables llegan de back-service/.env (env_file del compose),
# que genera `task setup`. Si falta, la validación de config del back no arranca y lo explica.

exec "$@"
