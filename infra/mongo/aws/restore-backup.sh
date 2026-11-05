#!/bin/bash
# Restaura un backup de s3://<OpsBucket>/backups/ en el mongod vacío de la instancia temporal (paso 6.4 del
# plan). Solo la base junte: los usuarios de admin no hacen falta para comparar los datos. Lo manda
# `task aws:restore`. Entorno: REGION, OPS_BUCKET, BACKUP_KEY.
set -euo pipefail
: "${REGION:?}" "${OPS_BUCKET:?}" "${BACKUP_KEY:?}"

# El UserData baja Docker y la imagen por el NAT: puede tardar unos minutos en dejar mongod listo.
for _ in $(seq 1 60); do
  if docker exec mongo mongosh --quiet --eval 'db.hello().ok' >/dev/null 2>&1; then break; fi
  sleep 10
done
docker exec mongo mongosh --quiet --eval 'db.hello().ok' >/dev/null || { echo 'mongod no arrancó en 10 minutos' >&2; exit 1; }

started=$(date +%s)
aws s3 cp "s3://$OPS_BUCKET/$BACKUP_KEY" - --region "$REGION" --only-show-errors |
  docker exec -i mongo mongorestore --archive --gzip --nsInclude 'junte.*' --drop --quiet
echo "restaurado $BACKUP_KEY en $(( $(date +%s) - started )) s"
