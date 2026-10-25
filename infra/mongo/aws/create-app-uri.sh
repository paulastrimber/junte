#!/bin/bash
# Crea (o actualiza si cambiaron los hosts) el secreto junte/<env>/mongo-app-uri, la MONGO_URI del back
# (paso 1.6). La arma acá adentro a partir de junte/<env>/mongo-app: la contraseña no sale de la instancia.
# Entorno: ENV_NAME, REGION, HOSTS (ip:puerto separados por coma).
set -euo pipefail
: "${ENV_NAME:?}" "${REGION:?}" "${HOSTS:?}"

name="junte/$ENV_NAME/mongo-app-uri"
app_json=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/mongo-app" --query SecretString --output text)
user=$(printf '%s' "$app_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
password=$(printf '%s' "$app_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')
uri="mongodb://$user:$password@$HOSTS/junte?replicaSet=rs0&authSource=junte"

if current=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$name" --query SecretString --output text 2>/dev/null); then
  if [ "$current" = "$uri" ]; then
    echo "$name: ya existe con los hosts $HOSTS"
  else
    aws secretsmanager put-secret-value --region "$REGION" --secret-id "$name" --secret-string "$uri" >/dev/null
    echo "$name: actualizado con los hosts $HOSTS"
  fi
else
  aws secretsmanager create-secret --region "$REGION" --name "$name" \
    --description 'URI de MongoDB del back (MONGO_URI), usuario junte_app. La crea task aws:mongo-init.' \
    --secret-string "$uri" \
    --tags "Key=project,Value=junte" "Key=env,Value=$ENV_NAME" "Key=Name,Value=junte-$ENV_NAME-mongo-app-uri" "Key=layer,Value=datos" >/dev/null
  echo "$name: creado con los hosts $HOSTS"
fi

# La URI guardada conecta como junte_app (sin mostrarla).
STORED=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$name" --query SecretString --output text)
export STORED
docker exec -i -e STORED mongo mongosh --quiet --nodb <<'JS'
const db = connect(process.env.STORED)
const users = db.runCommand({ connectionStatus: 1 }).authInfo.authenticatedUsers
print('la URI guardada conecta como: ' + users.map((u) => u.user + '@' + u.db).join(', '))
JS
