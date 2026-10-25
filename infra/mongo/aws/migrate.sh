#!/bin/bash
# Migraciones (migrate-mongo up) y sync de catálogos con la imagen del back y el usuario junte_migrations
# (paso 1.6; docs/flujo/: migraciones antes de actualizar el back). Corre por Session Manager en una
# instancia del back (lo mandan `task aws:migrate` y `task back:release`).
# Entorno: ENV_NAME, REGION, HOSTS; IMAGE_TAG opcional (por defecto, el tag que corre en la instancia).
set -euo pipefail
: "${ENV_NAME:?}" "${REGION:?}" "${HOSTS:?}"
# shellcheck source=/dev/null
. /opt/junte/back.conf
tag=${IMAGE_TAG:-$(cat /opt/junte/back.tag)}
image="$REPOSITORY_URI:$tag"

if ! docker image inspect "$image" >/dev/null 2>&1; then
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPOSITORY_URI%%/*}" >/dev/null
  docker pull --quiet "$image" >/dev/null
fi

migrations_json=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/mongo-migrations" --query SecretString --output text)
user=$(printf '%s' "$migrations_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
password=$(printf '%s' "$migrations_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')
MONGO_URI="mongodb://$user:$password@$HOSTS/junte?replicaSet=rs0&authSource=junte"
MONGO_DB_NAME=junte
export MONGO_URI MONGO_DB_NAME

# Por las dudas: ninguna línea de salida puede mostrar la URI con la contraseña.
mask () { sed -E 's#mongodb://[^@ ]*@#mongodb://<oculto>@#g'; }
run () { docker run --rm -e MONGO_URI -e MONGO_DB_NAME "$image" "$@" 2>&1 | mask; }

echo "== migrate-mongo up (usuario $user, imagen $tag)"
run npx migrate-mongo up | tail -40
echo "== migraciones pendientes: $(run npx migrate-mongo status | grep -c PENDING || true)"
echo '== sync de catálogos'
run node scripts/sync-catalogs.js | tail -5
