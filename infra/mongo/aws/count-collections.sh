#!/bin/bash
# Documentos e índices por colección de la base junte, una línea "<colección> <documentos> <índices>" ordenada,
# para comparar el origen con la restauración (paso 6.4 del plan). Lo manda `task aws:restore`.
# Entorno: TARGET=replica (en un nodo, con el usuario admin; además ENV_NAME, REGION, HOSTS) o
# TARGET=restore (en la instancia temporal, mongod sin autenticación en 127.0.0.1). Solo lectura.
set -euo pipefail
: "${TARGET:?}"

if [ "$TARGET" = replica ]; then
  : "${ENV_NAME:?}" "${REGION:?}" "${HOSTS:?}"
  ADMIN_JSON=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/mongo-admin" --query SecretString --output text)
else
  ADMIN_JSON=''
  HOSTS=127.0.0.1:27017
fi
export ADMIN_JSON HOSTS TARGET

# Con --eval y no por stdin: así mongosh no mezcla sus prompts con las líneas que se comparan.
SCRIPT=$(cat <<'JS'
const replica = process.env.TARGET === 'replica'
const db = connect('mongodb://' + process.env.HOSTS + '/junte' + (replica ? '?replicaSet=rs0' : ''))
if (replica) {
  const admin = JSON.parse(process.env.ADMIN_JSON)
  db.getSiblingDB('admin').auth(admin.username, admin.password)
}
db.getCollectionNames().filter((name) => !name.startsWith('system.')).sort().forEach((name) => {
  print(name + ' ' + db.getCollection(name).countDocuments({}) + ' ' + db.getCollection(name).getIndexes().length)
})
JS
)
docker exec -e ADMIN_JSON -e HOSTS -e TARGET mongo mongosh --quiet --nodb --eval "$SCRIPT"
