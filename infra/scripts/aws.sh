#!/usr/bin/env bash
# Comandos de despliegue de junte en AWS (docs/infra/plan-aws.md, "Rutina de cada sesión").
# Los llaman las tareas aws:* y back:release del Taskfile:
#
#   aws.sh up      <env>                 enciende la sesión: egress, redis, back y front
#   aws.sh down    <env>                 la apaga (al revés) y verifica que no quede nada cobrando
#   aws.sh status  <env>                 qué stacks existen, qué cobra por hora y si la API responde
#   aws.sh deploy  <env> <stack> [K=V…]  un solo stack, con change set y confirmación
#   aws.sh release <env>                 construye la imagen del back, la sube a ECR, migra y actualiza las instancias
#   aws.sh mongo-init <env>              replica set, usuarios, secreto mongo-app-uri y backup (1 o 3 nodos)
#   aws.sh migrate <env> [tag]           migraciones y catálogos desde una instancia del back
#   aws.sh backup  <env>                 dispara un backup de MongoDB a S3 ahora
#
# <env> es dev (cuenta A, perfil junte-dev) o entrega (cuenta B, perfil junte-entrega).
# Pide confirmación antes de crear o borrar (YES=1 la omite). Nunca imprime el ID de la cuenta ni
# valores de secretos. Compatible con el bash 3.2 de macOS.
set -euo pipefail

REGION=us-east-1
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TEMPLATES=$ROOT/infra/templates
MONGO_SCRIPTS=$ROOT/infra/mongo/aws
# Los de sesión cobran por hora: se encienden y se borran en cada sesión. Los permanentes no se borran nunca desde acá.
SESSION_STACKS='egress redis back front'
ALL_STACKS='network base dns mongo egress redis back front'

die () { printf '\nError: %s\n' "$*" >&2; exit 1; }
# Tapa IDs de cuenta (12 dígitos) en lo que se muestra: aparecen en ARNs y en la URI de ECR.
redact () { sed -E 's/[0-9]{12}/<cuenta>/g'; }
info () { printf '\n==> %s\n' "$*"; }

usage () {
  sed -n '5,12p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

template_of () {
  case "$1" in
    base) echo 00-base ;;
    dns) echo 01-dns-cert ;;
    network) echo 10-network ;;
    egress) echo 20-egress ;;
    redis) echo 30-redis ;;
    mongo) echo 31-mongo ;;
    back) echo 40-back ;;
    front) echo 50-front ;;
    *) return 1 ;;
  esac
}

confirm () {
  if [ "${YES:-}" = 1 ]; then return 0; fi
  printf '\n%s [s/N] ' "$1"
  read -r answer
  case "$answer" in
    s | S | si | SI | sí | Sí) ;;
    *) die 'cancelado: no se cambió nada' ;;
  esac
}

aws_ () { aws --profile "$PROFILE" --region "$REGION" "$@"; }

stack_name () { echo "junte-$ENV_NAME-$1"; }

# Estado del stack, o NONE si no existe.
stack_status () {
  aws_ cloudformation describe-stacks --stack-name "$(stack_name "$1")" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo NONE
}

# Un output del stack, o vacío si no existe.
output_of () {
  local value
  value=$(aws_ cloudformation describe-stacks --stack-name "$(stack_name "$1")" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text 2>/dev/null) || value=''
  if [ "$value" = None ]; then value=''; fi
  echo "$value"
}

preflight () {
  command -v aws >/dev/null || die 'falta AWS CLI v2'
  local arn
  arn=$(aws_ sts get-caller-identity --query Arn --output text 2>/dev/null) ||
    die "las credenciales del perfil $PROFILE no funcionan: Start Lab y volvé a copiarlas en ~/.aws/credentials"
  # Solo el rol: el ARN completo incluye el ID de la cuenta.
  printf 'Cuenta activa: perfil %s · rol %s · región %s · entorno %s\n' "$PROFILE" "${arn#*:assumed-role/}" "$REGION" "$ENV_NAME"
}

# Key=Value de infra/parameters/<env>/<template>.json, con los extra (Key=Value) por encima.
parameter_overrides () {
  local file=$1; shift
  [ -f "$file" ] || die "no existe $file"
  # shellcheck disable=SC2016 # los ${…} son de JavaScript, no de bash
  node -e '
    const [file, ...extra] = process.argv.slice(1)
    const values = new Map(JSON.parse(require("fs").readFileSync(file, "utf8")).map((p) => [p.ParameterKey, p.ParameterValue]))
    for (const pair of extra) {
      const i = pair.indexOf("=")
      if (i < 1) { console.error(`parámetro inválido: ${pair} (se espera Clave=Valor)`); process.exit(1) }
      values.set(pair.slice(0, i), pair.slice(i + 1))
    }
    for (const [key, value] of values) {
      if (/\s/.test(value)) { console.error(`el valor de ${key} no puede tener espacios`); process.exit(1) }
      console.log(`${key}=${value}`)
    }
  ' "$file" "$@"
}

# deploy_stack <stack> [--review] [Key=Value…]
# Sin --review crea y ejecuta el change set; con --review lo muestra y pide confirmación antes.
deploy_stack () {
  local name=$1; shift
  local review=0
  if [ "${1:-}" = --review ]; then review=1; shift; fi
  local template; template=$(template_of "$name") || die "stack desconocido: $name (opciones: $ALL_STACKS)"
  local status; status=$(stack_status "$name")
  case "$status" in
    ROLLBACK_COMPLETE | ROLLBACK_FAILED | DELETE_FAILED)
      die "$(stack_name "$name") quedó en $status: borralo desde la consola (o con aws cloudformation delete-stack) y volvé a intentar" ;;
  esac

  local overrides
  overrides=$(parameter_overrides "$ROOT/infra/parameters/$ENV_NAME/$template.json" "$@") || exit 1
  local capabilities=()
  if [ "$name" = base ]; then capabilities=(--capabilities CAPABILITY_NAMED_IAM); fi

  info "$(stack_name "$name") ($template.yml)"
  local args=(cloudformation deploy --stack-name "$(stack_name "$name")" --template-file "$TEMPLATES/$template.yml"
    --tags project=junte env="$ENV_NAME" --no-fail-on-empty-changeset)
  # shellcheck disable=SC2206 # una línea por Clave=Valor, sin espacios (lo valida parameter_overrides)
  args+=(--parameter-overrides $overrides)
  args+=(${capabilities[@]+"${capabilities[@]}"})

  if [ "$review" = 0 ]; then
    local result
    if ! result=$(aws_ "${args[@]}" 2>&1); then
      printf '%s\n' "$result" | redact >&2
      die "falló el despliegue de $(stack_name "$name"): revisá sus eventos en la consola de CloudFormation"
    fi
    printf '%s\n' "$result" | redact
    return 0
  fi

  local output changeset
  output=$(aws_ "${args[@]}" --no-execute-changeset) || die "no se pudo crear el change set de $(stack_name "$name")"
  changeset=$(printf '%s\n' "$output" | grep -o 'arn:aws:cloudformation:[^ ]*changeSet/[^ ]*' | head -1 || true)
  if [ -z "$changeset" ]; then
    echo 'Sin cambios: el stack ya está como dice el template.'
    return
  fi
  aws_ cloudformation describe-change-set --change-set-name "$changeset" \
    --query 'Changes[].ResourceChange.{Accion:Action,Tipo:ResourceType,Recurso:LogicalResourceId,Reemplazo:Replacement}' --output table
  confirm "¿Aplicar este change set en $(stack_name "$name")?"
  aws_ cloudformation execute-change-set --change-set-name "$changeset"
  if [ "$status" = NONE ] || [ "$status" = REVIEW_IN_PROGRESS ]; then
    aws_ cloudformation wait stack-create-complete --stack-name "$(stack_name "$name")"
  else
    aws_ cloudformation wait stack-update-complete --stack-name "$(stack_name "$name")"
  fi || die "$(stack_name "$name") no terminó bien: revisá sus eventos en la consola de CloudFormation"
  echo "$(stack_name "$name"): $(stack_status "$name")"
}

delete_stack () {
  local name=$1
  if [ "$(stack_status "$name")" = NONE ]; then return 0; fi
  info "Borrando $(stack_name "$name")"
  aws_ cloudformation delete-stack --stack-name "$(stack_name "$name")"
  aws_ cloudformation wait stack-delete-complete --stack-name "$(stack_name "$name")" ||
    die "no se pudo borrar $(stack_name "$name"): revisá sus eventos en la consola de CloudFormation"
}

require_stack () {
  case "$(stack_status "$1")" in
    CREATE_COMPLETE | UPDATE_COMPLETE | UPDATE_ROLLBACK_COMPLETE) ;;
    *) die "falta $(stack_name "$1") (es permanente): desplegalo con task aws:deploy ENV=$ENV_NAME STACK=$1 ($2)" ;;
  esac
}

# Lo que cobra por hora. Devuelve 1 si queda algo.
check_billable () {
  local nat alb redis eip endpoints
  nat=$(aws_ ec2 describe-nat-gateways --filter Name=state,Values=pending,available --query 'length(NatGateways)' --output text)
  alb=$(aws_ elbv2 describe-load-balancers --query 'length(LoadBalancers)' --output text)
  redis=$(aws_ elasticache describe-replication-groups --query 'length(ReplicationGroups)' --output text)
  eip=$(aws_ ec2 describe-addresses --query 'length(Addresses)' --output text)
  endpoints=$(aws_ ec2 describe-vpc-endpoints --filters Name=vpc-endpoint-type,Values=Interface --query 'length(VpcEndpoints)' --output text)
  printf '  NAT Gateways: %s · balanceadores: %s · Redis: %s · IP elásticas: %s · endpoints de interfaz: %s\n' "$nat" "$alb" "$redis" "$eip" "$endpoints"
  [ "$nat$alb$redis$eip$endpoints" = 00000 ]
}

wait_health () {
  local url=$1 _
  info "Esperando a $url/health (hasta 10 minutos)"
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "$url/health" 2>/dev/null; then echo; return 0; fi
    sleep 10
  done
  echo "La API no respondió todavía. Revisá los destinos de los target groups y los logs /junte/$ENV_NAME/back y /junte/$ENV_NAME/nginx."
  return 1
}

sync_nginx_config () {
  local bucket; bucket=$(output_of base OpsBucket)
  [ -n "$bucket" ] || die "no encuentro el bucket de operación (output OpsBucket de $(stack_name base))"
  info "Subiendo front-service/ a s3://$bucket/nginx/"
  aws_ s3 sync "$ROOT/front-service/" "s3://$bucket/nginx/" --delete --only-show-errors \
    --exclude 'tests/*' --exclude '*.gitkeep' --exclude '.DS_Store'
}

cmd_up () {
  preflight
  require_stack network 'paso 1.3'
  require_stack base 'pasos 1.1 y 1.2'
  require_stack mongo 'paso 1.6'
  require_stack dns 'paso 1.9'
  [ -n "$(output_of dns ApiCertificateArn)" ] ||
    die "el stack dns no tiene certificado: después de delegar el subdominio, task aws:deploy ENV=$ENV_NAME STACK=dns PARAMS='ZoneName=<zona> CreateCertificate=true'"
  aws_ ecr describe-images --repository-name "junte-$ENV_NAME-back" --image-ids imageTag=latest >/dev/null 2>&1 ||
    die "no hay imagen del back en ECR: primero task back:release ENV=$ENV_NAME"

  local cost='~0,17 USD/h'
  if [ "$ENV_NAME" = entrega ]; then cost='~0,41 USD/h'; fi
  echo "Se van a encender (o actualizar): $SESSION_STACKS. Cobran por hora ($cost) hasta task aws:down ENV=$ENV_NAME."
  confirm '¿Encender la sesión?'

  local started; started=$(date +%s)
  deploy_stack egress
  deploy_stack redis
  deploy_stack back
  run_migrations ''
  sync_nginx_config
  deploy_stack front

  local url; url=$(output_of front ApiUrl)
  info "API: $url (EXPO_PUBLIC_API_URL)"
  wait_health "$url" || true
  printf '\nSesión encendida en %s min. Al terminar: task aws:down ENV=%s\n' $(( ($(date +%s) - started) / 60 )) "$ENV_NAME"
}

cmd_down () {
  preflight
  local present='' name
  for name in front back redis egress; do
    if [ "$(stack_status "$name")" != NONE ]; then present="$present $name"; fi
  done
  if [ -z "$present" ]; then
    echo 'No hay stacks de sesión encendidos.'
  else
    echo "Se van a borrar (en este orden):$present. Los permanentes (network, base, dns, mongo) no se tocan."
    confirm '¿Apagar la sesión?'
    for name in front back redis egress; do delete_stack "$name"; done
  fi
  info 'Lo que cobra por hora en la cuenta'
  if check_billable; then
    echo 'Nada cobrando por hora. Anotá el crédito usado.'
  else
    die 'todavía queda algo cobrando: revisalo en la consola antes de cerrar la sesión'
  fi
}

cmd_status () {
  preflight
  info 'Stacks'
  local name
  for name in $ALL_STACKS; do
    printf '  %-28s %s\n' "$(stack_name "$name")" "$(stack_status "$name" | sed 's/^NONE$/no existe/')"
  done
  info 'Lo que cobra por hora en la cuenta'
  check_billable || echo '  Hay recursos que cobran por hora: al terminar, task aws:down.'
  local url; url=$(output_of front ApiUrl)
  if [ -n "$url" ]; then
    info "Health: $url/health"
    curl -fsS --max-time 5 "$url/health" || echo '  No responde.'
    echo
  fi
}

roll_instance () {
  local id=$1 tag=$2 target_group=$3
  info "Actualizando $id a $tag (sale del balanceador mientras tanto)"
  aws_ elbv2 deregister-targets --target-group-arn "$target_group" --targets "Id=$id,Port=3000"
  aws_ elbv2 wait target-deregistered --target-group-arn "$target_group" --targets "Id=$id,Port=3000"
  local command_id
  command_id=$(aws_ ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
    --comment "junte back:release $tag" --parameters "commands=[\"/opt/junte/start-back.sh $tag\"]" \
    --query Command.CommandId --output text)
  if ! aws_ ssm wait command-executed --command-id "$command_id" --instance-id "$id"; then
    aws_ ssm get-command-invocation --command-id "$command_id" --instance-id "$id" \
      --query StandardErrorContent --output text | tail -20
    aws_ elbv2 register-targets --target-group-arn "$target_group" --targets "Id=$id,Port=3000"
    die "falló la actualización de $id (el contenedor anterior puede haber quedado detenido): mirá el error de arriba"
  fi
  aws_ elbv2 register-targets --target-group-arn "$target_group" --targets "Id=$id,Port=3000"
  aws_ elbv2 wait target-in-service --target-group-arn "$target_group" --targets "Id=$id,Port=3000" ||
    die "$id no quedó sano con $tag: mirá el log /junte/$ENV_NAME/back en CloudWatch"
  echo "$id: sano con $tag"
}

cmd_release () {
  command -v docker >/dev/null || die 'falta Docker'
  docker info >/dev/null 2>&1 || die 'Docker no está corriendo'
  preflight
  local repository; repository=$(output_of base BackRepositoryUri)
  [ -n "$repository" ] || die "no encuentro el repositorio de ECR (output BackRepositoryUri de $(stack_name base))"

  local tag; tag=$(git -C "$ROOT" rev-parse --short HEAD)
  if [ -n "$(git -C "$ROOT" status --porcelain -- back-service)" ]; then
    tag="$tag-dirty"
    echo "Ojo: back-service/ tiene cambios sin commitear; la imagen se etiqueta $tag."
  fi
  echo "Imagen: junte-$ENV_NAME-back:$tag (y latest)."
  confirm '¿Construir y subir la imagen del back?'

  # Las EC2 t3 son x86_64: desde una Mac con Apple Silicon hay que construir para linux/amd64.
  # Sin provenance ni SBOM, Docker sube una sola imagen y no un índice con anexos: el escaneo de
  # ECR analiza imágenes (no índices) y la regla "conservar las últimas 5" cuenta cada pieza.
  info "Construyendo back-service (target prod, linux/amd64)"
  docker build --platform linux/amd64 --provenance=false --sbom=false --target prod -t "$repository:$tag" -t "$repository:latest" "$ROOT/back-service" 2>&1 | redact
  info 'Subiendo a ECR'
  aws_ ecr get-login-password | docker login --username AWS --password-stdin "${repository%%/*}" >/dev/null
  docker push --quiet "$repository:$tag" | redact
  docker push --quiet "$repository:latest" | redact

  if [ "$(stack_status back)" = NONE ]; then
    echo "Imagen subida. $(stack_name back) no está encendido: la va a usar cuando se despliegue (task aws:up)."
    return
  fi
  run_migrations "$tag"
  local target_group id
  target_group=$(output_of back BackTargetGroupArn)
  [ -n "$target_group" ] || die "$(stack_name back) no tiene el output BackTargetGroupArn: actualizalo con task aws:deploy ENV=$ENV_NAME STACK=back"
  for id in $(output_of back BackAInstanceId) $(output_of back BackBInstanceId); do
    roll_instance "$id" "$tag" "$target_group"
  done
  local url; url=$(output_of front ApiUrl)
  if [ -n "$url" ]; then wait_health "$url" || true; fi
  echo "Back actualizado a $tag."
}

# ssm_run <instancia> <script> [Clave=Valor…]: corre un script de infra/mongo/aws por Session Manager con esas
# variables de entorno (sin comillas simples en los valores) y muestra su salida. Falla si el script falla.
ssm_run () {
  local id=$1 script=$2; shift 2
  local parameters command_id status _
  # shellcheck disable=SC2016 # los ${…} son de JavaScript, no de bash
  parameters=$(node -e '
    const [file, ...vars] = process.argv.slice(1)
    const lines = []
    for (const pair of vars) {
      const i = pair.indexOf("=")
      const value = pair.slice(i + 1)
      if (i < 1 || value.includes("\x27")) { console.error(`variable inválida: ${pair}`); process.exit(1) }
      lines.push(`export ${pair.slice(0, i)}=\x27${value}\x27`)
    }
    lines.push(...require("fs").readFileSync(file, "utf8").split("\n"))
    console.log(JSON.stringify({ commands: lines, executionTimeout: ["1800"] }))
  ' "$script" "$@") || exit 1
  command_id=$(aws_ ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
    --comment "junte $(basename "$script")" --parameters "$parameters" --query Command.CommandId --output text)
  # Sin `ssm wait`: se rinde a los ~8 minutos y un backup o muchas migraciones pueden tardar más.
  status=Pending
  for _ in $(seq 1 360); do
    status=$(aws_ ssm get-command-invocation --command-id "$command_id" --instance-id "$id" --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending | InProgress | Delayed) sleep 5 ;; *) break ;; esac
  done
  aws_ ssm get-command-invocation --command-id "$command_id" --instance-id "$id" --query StandardOutputContent --output text | redact
  if [ "$status" != Success ]; then
    aws_ ssm get-command-invocation --command-id "$command_id" --instance-id "$id" --query StandardErrorContent --output text | redact | tail -20 >&2
    die "falló $(basename "$script") en $id ($status)"
  fi
}

wait_ssm_online () {
  local id=$1 _ ping=''
  for _ in $(seq 1 60); do
    ping=$(aws_ ssm describe-instance-information --filters "Key=InstanceIds,Values=$id" \
      --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)
    if [ "$ping" = Online ]; then return 0; fi
    sleep 10
  done
  die "$id no aparece en Session Manager después de 10 minutos"
}

# Espera a que el arranque del nodo deje el contenedor de Mongo corriendo (baja la imagen por el NAT).
wait_mongo_running () {
  local id=$1 _ check
  check=$(mktemp)
  # shellcheck disable=SC2016 # se evalúa en la instancia, no acá
  echo '[ "$(docker inspect -f "{{.State.Running}}" mongo 2>/dev/null)" = true ]' > "$check"
  for _ in $(seq 1 40); do
    if ssm_run "$id" "$check" >/dev/null 2>&1; then rm -f "$check"; return 0; fi
    sleep 15
  done
  rm -f "$check"
  die "en $id el contenedor de Mongo no arrancó en 10 minutos: ¿está encendido egress? (el nodo baja Docker y la imagen por el NAT)"
}

mongo_nodes () {
  local name
  for name in NodeAInstanceId NodeBInstanceId NodeCInstanceId; do output_of mongo "$name"; done | grep . || true
}

# run_migrations <tag>: migraciones y catálogos desde la primera instancia del back ('' = el tag que corre).
run_migrations () {
  local tag=$1 id hosts
  id=$(output_of back BackAInstanceId)
  hosts=$(output_of mongo MongoHosts)
  [ -n "$id" ] || die "falta $(stack_name back): las migraciones corren desde una instancia del back (task aws:up)"
  [ -n "$hosts" ] || die "falta $(stack_name mongo)"
  info "Migraciones y catálogos (desde $id${tag:+, imagen $tag})"
  wait_ssm_online "$id"
  ssm_run "$id" "$MONGO_SCRIPTS/migrate.sh" "ENV_NAME=$ENV_NAME" "REGION=$REGION" "HOSTS=$hosts" "IMAGE_TAG=$tag"
}

cmd_mongo_init () {
  preflight
  require_stack mongo 'paso 1.6'
  require_stack base 'pasos 1.1 y 1.2'
  local hosts bucket nodes first id
  hosts=$(output_of mongo MongoHosts)
  bucket=$(output_of base OpsBucket)
  nodes=$(mongo_nodes | tr '\n' ' ')
  first=${nodes%% *}
  echo "Replica set rs0: $hosts"
  echo "Inicia el replica set y los usuarios (lo que falte), crea o actualiza junte/$ENV_NAME/mongo-app-uri (0,40 USD/mes)"
  echo "e instala en cada nodo el backup cada hora a s3://$bucket/backups/ (el primero corre enseguida)."
  confirm '¿Seguir?'
  for id in $nodes; do
    info "Esperando a $id (Session Manager y contenedor de Mongo)"
    wait_ssm_online "$id"
    wait_mongo_running "$id"
  done
  info "Replica set y usuarios (en $first)"
  ssm_run "$first" "$MONGO_SCRIPTS/init-replica-set.sh" "ENV_NAME=$ENV_NAME" "REGION=$REGION" "HOSTS=$hosts"
  info 'Secreto mongo-app-uri'
  ssm_run "$first" "$MONGO_SCRIPTS/create-app-uri.sh" "ENV_NAME=$ENV_NAME" "REGION=$REGION" "HOSTS=$hosts"
  for id in $nodes; do
    info "Backup periódico en $id"
    ssm_run "$id" "$MONGO_SCRIPTS/install-backup.sh" "ENV_NAME=$ENV_NAME" "REGION=$REGION" "OPS_BUCKET=$bucket"
  done
  info 'Verificación'
  ssm_run "$first" "$MONGO_SCRIPTS/verify-replica-set.sh" "ENV_NAME=$ENV_NAME" "REGION=$REGION" "HOSTS=$hosts"
}

cmd_migrate () {
  preflight
  require_stack mongo 'paso 1.6'
  require_stack back 'paso 1.8: task aws:up'
  echo "Aplica las migraciones pendientes y suma los catálogos nuevos en junte (usuario junte_migrations)."
  confirm '¿Migrar?'
  run_migrations "${1:-}"
}

cmd_backup () {
  preflight
  require_stack mongo 'paso 1.6'
  local bucket id check
  bucket=$(output_of base OpsBucket)
  echo "Dispara el backup en cada nodo (lo hace uno solo) y lo sube a s3://$bucket/backups/."
  confirm '¿Hacer el backup ahora?'
  check=$(mktemp)
  echo 'systemctl start junte-mongo-backup.service; journalctl -u junte-mongo-backup.service -n 2 --no-pager -o cat' > "$check"
  for id in $(mongo_nodes); do
    info "$id"
    ssm_run "$id" "$check" || { rm -f "$check"; exit 1; }
  done
  rm -f "$check"
  info 'Últimos backups'
  aws_ s3 ls "s3://$bucket/backups/" | tail -5
}

[ $# -ge 2 ] || usage
COMMAND=$1
ENV_NAME=$2
shift 2
case "$ENV_NAME" in
  dev | entrega) ;;
  *) die "entorno inválido: $ENV_NAME (dev o entrega)" ;;
esac
PROFILE=junte-$ENV_NAME

case "$COMMAND" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  release) cmd_release ;;
  mongo-init) cmd_mongo_init ;;
  migrate) cmd_migrate "$@" ;;
  backup) cmd_backup ;;
  deploy)
    [ $# -ge 1 ] || die "falta el stack (opciones: $ALL_STACKS)"
    preflight
    stack=$1; shift
    deploy_stack "$stack" --review "$@"
    ;;
  *) usage ;;
esac
