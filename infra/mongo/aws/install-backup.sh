#!/bin/bash
# Instala el backup periódico de MongoDB en un nodo (paso 6.3 del plan): /opt/junte/backup-mongo.sh y el
# timer de systemd junte-mongo-backup (15 min después de arrancar y cada hora: el lab apaga las instancias
# de noche, un horario nocturno no correría nunca). Lo manda `task aws:mongo-init` a cada nodo; se puede
# repetir para actualizarlo. Entorno: ENV_NAME, REGION, OPS_BUCKET.
set -euo pipefail
: "${ENV_NAME:?}" "${REGION:?}" "${OPS_BUCKET:?}"

mkdir -p /opt/junte
umask 077
printf 'ENV_NAME=%s\nREGION=%s\nOPS_BUCKET=%s\n' "$ENV_NAME" "$REGION" "$OPS_BUCKET" > /opt/junte/backup.conf

cat > /opt/junte/backup-mongo.sh <<'BACKUP'
#!/bin/bash
# Backup de MongoDB a s3://<OpsBucket>/backups/ (vence a los 14 días por la regla del bucket).
# Hace el dump un solo nodo: el único de un replica set de 1, o el primer secundario (por host) de 3.
set -euo pipefail
# shellcheck source=/dev/null
. /opt/junte/backup.conf

role=$(docker exec mongo mongosh --quiet --eval '
  const h = db.hello()
  const hosts = h.hosts || []
  const firstSecondary = hosts.filter((x) => x !== h.primary).sort()[0]
  print(hosts.length === 1 ? (h.isWritablePrimary ? "backup" : "skip") : (h.secondary && h.me === firstSecondary ? "backup" : "skip"))')
if [ "$role" != backup ]; then
  echo "este nodo no hace el backup (lo hace el primer secundario)"
  exit 0
fi

credentials=$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "junte/$ENV_NAME/mongo-backup" --query SecretString --output text)
user=$(printf '%s' "$credentials" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
password=$(printf '%s' "$credentials" | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')

# La contraseña va a un archivo de configuración de mongodump (600, dentro del contenedor), no a la línea de comandos.
trap 'docker exec mongo rm -f /tmp/junte-dump.yaml' EXIT
printf 'password: "%s"\n' "$password" | docker exec -i mongo sh -c 'umask 077; cat > /tmp/junte-dump.yaml'

key="backups/mongo-$ENV_NAME-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
# Primero .partial y recién al terminar bien se renombra: nunca queda un backup cortado con nombre de bueno.
if docker exec mongo mongodump --host 127.0.0.1 --port 27017 --username "$user" --authenticationDatabase admin \
     --config /tmp/junte-dump.yaml --readPreference secondaryPreferred --archive --gzip --quiet |
   aws s3 cp - "s3://$OPS_BUCKET/$key.partial" --region "$REGION" --only-show-errors; then
  aws s3 mv "s3://$OPS_BUCKET/$key.partial" "s3://$OPS_BUCKET/$key" --region "$REGION" --only-show-errors
  size=$(aws s3api head-object --bucket "$OPS_BUCKET" --key "$key" --region "$REGION" --query ContentLength --output text)
  echo "backup subido: s3://$OPS_BUCKET/$key ($size bytes)"
else
  aws s3 rm "s3://$OPS_BUCKET/$key.partial" --region "$REGION" --only-show-errors || true
  echo 'falló el backup: no quedó ningún archivo en S3' >&2
  exit 1
fi
BACKUP
chmod 700 /opt/junte/backup-mongo.sh

cat > /etc/systemd/system/junte-mongo-backup.service <<'UNIT'
[Unit]
Description=Backup de MongoDB a S3 (junte, paso 6.3)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/junte/backup-mongo.sh
UNIT

cat > /etc/systemd/system/junte-mongo-backup.timer <<'UNIT'
[Unit]
Description=Backup de MongoDB 15 min después de arrancar y cada hora (junte)

[Timer]
OnBootSec=15min
OnUnitActiveSec=1h

[Install]
WantedBy=timers.target
UNIT

chmod 644 /etc/systemd/system/junte-mongo-backup.service /etc/systemd/system/junte-mongo-backup.timer
systemctl daemon-reload
systemctl enable --now junte-mongo-backup.timer >/dev/null 2>&1
echo "backup instalado en $(hostname -I | awk '{print $1}'): próximo $(systemctl show junte-mongo-backup.timer -p NextElapseUSecMonotonic --value | sed 's/^$/(al activarse)/')"
