#!/usr/bin/env bash
# Smoke test del front service (Nginx). Ver docs/arquitectura/04-front-service.md.
#
#   bash front-service/tests/smoke.sh [base_url]        (por defecto http://localhost:8080)
#
# Verifica: /health, X-Request-Id (siempre generado por Nginx; el del cliente no llega al back), proxy /api/v1/* → /internal/*,
# /internal no publicado, upgrade a WebSocket de Socket.io (y long-polling rechazado), límite de body, 429 JSON tras una ráfaga en /api/v1/auth/login,
# que las variantes de esa URL y /auth/register comparten el límite estricto, que /auth/refresh NO lo
# comparte (usa la zona general), que un X-Forwarded-For de un cliente externo no evade el límite, que
# el límite es por IP real y que el panel /admin sale con sus cabeceras de seguridad.
#
# Las verificaciones marcadas [local] necesitan el entorno de docker compose levantado:
#   - leen el access log de Nginx (para ver el path reescrito y la IP real), y
#   - la de "IP real" manda requests desde un contenedor dentro de la red de compose, que es
#     la red de confianza (como el ALB en AWS). Desde el host no se puede: el host es un cliente
#     externo y Nginx ignora su X-Forwarded-For.
# Contra otro entorno (base_url no local) se omiten. Variables:
#   SMOKE_COMPOSE_FILE   compose del entorno local (por defecto infra/docker-compose.dev.yml)
#   SMOKE_SKIP_LOCAL=1   omite las verificaciones [local]
#
# Sale con 0 si todo pasa, 1 si algo falla.

set -uo pipefail

BASE_URL="${1:-http://localhost:8080}"
BASE_URL="${BASE_URL%/}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SMOKE_COMPOSE_FILE:-$(cd "$SCRIPT_DIR/../.." && pwd)/infra/docker-compose.dev.yml}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ -t 1 ]; then
  C_OK=$'\e[32m'; C_FAIL=$'\e[31m'; C_SKIP=$'\e[33m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else
  C_OK=''; C_FAIL=''; C_SKIP=''; C_DIM=''; C_OFF=''
fi

PASSED=0; FAILED=0; SKIPPED=0
ok()   { PASSED=$((PASSED + 1));   printf '  %s[ OK ]%s %s\n' "$C_OK" "$C_OFF" "$1"; }
fail() { FAILED=$((FAILED + 1));   printf '  %s[FAIL]%s %s\n' "$C_FAIL" "$C_OFF" "$1"; [ -n "${2:-}" ] && printf '         %s%s%s\n' "$C_DIM" "$2" "$C_OFF"; return 0; }
skip() { SKIPPED=$((SKIPPED + 1)); printf '  %s[SKIP]%s %s\n' "$C_SKIP" "$C_OFF" "$1"; }
section() { printf '\n%s\n' "$1"; }
rand() { printf '%s%s' "$(date +%s)" "$RANDOM"; }

# request <nombre> <curl args...>: deja status en $TMP/<nombre>.status, headers y body.
request() {
  local name="$1"; shift
  curl -sS --max-time 10 -D "$TMP/$name.headers" -o "$TMP/$name.body" -w '%{http_code}' "$@" \
    > "$TMP/$name.status" 2> "$TMP/$name.err" || true
}
status()  { cat "$TMP/$1.status"; }
body()    { cat "$TMP/$1.body" 2>/dev/null; }
header()  { grep -i "^$2:" "$TMP/$1.headers" 2>/dev/null | tail -n 1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
json_field() { sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p" "$TMP/$1.body" 2>/dev/null; }

is_local=false
case "$BASE_URL" in
  http://localhost*|http://127.0.0.1*|http://\[::1\]*) is_local=true ;;
esac

local_checks=false
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }
if [ "${SMOKE_SKIP_LOCAL:-0}" != 1 ] && $is_local \
   && command -v docker >/dev/null 2>&1 \
   && [ -n "$(compose ps --status running -q nginx 2>/dev/null)" ]; then
  local_checks=true
fi

# Busca en el access log de Nginx la línea con ese requestId.
nginx_log_line() {
  local id="$1" line="" i
  for i in 1 2 3 4 5; do
    line="$(compose logs --no-log-prefix --since 5m nginx 2>/dev/null | grep -F "\"requestId\":\"$id\"" | tail -n 1)"
    [ -n "$line" ] && break
    sleep 0.5
  done
  printf '%s' "$line"
}

printf 'Smoke test del front service contra %s\n' "$BASE_URL"
$local_checks && printf '%sVerificaciones [local] habilitadas (compose: %s)%s\n' "$C_DIM" "$COMPOSE_FILE" "$C_OFF"

# ── /health ──────────────────────────────────────────────────────────
section '/health'
request health "$BASE_URL/health"
if [ "$(status health)" = 000 ]; then
  fail "no hay conexión con $BASE_URL" "$(cat "$TMP/health.err")"
  printf '\n%s¿Está levantado el entorno? docker compose -f infra/docker-compose.dev.yml up -d%s\n' "$C_FAIL" "$C_OFF"
  exit 1
fi
[ "$(status health)" = 200 ] && ok "GET /health → 200" || fail "GET /health → $(status health), se esperaba 200"
[ "$(body health)" = ok ] && ok "lo responde Nginx (body 'ok')" || fail "body inesperado en /health" "$(body health | head -c 200)"

# ── X-Request-Id ─────────────────────────────────────────────────────
section 'X-Request-Id'
generated="$(header health X-Request-Id)"
[ -n "$generated" ] && ok "Nginx genera uno si no viene ($generated)" || fail "la respuesta de /health no trae X-Request-Id"

is_nginx_id() { [[ "$1" =~ ^[0-9a-f]{32}$ ]]; }

sent="smoke-$(rand)"
request rid_health -H "X-Request-Id: $sent" "$BASE_URL/health"
got="$(header rid_health X-Request-Id)"
if [ "$got" != "$sent" ] && is_nginx_id "$got"; then
  ok "pisa el enviado por el cliente con uno propio ($got)"
else
  fail "no pisa el X-Request-Id del cliente en /health" "enviado=$sent recibido=$got"
fi

# ── Proxy /api/v1 → /internal ────────────────────────────────────────
section 'Proxy /api/v1/* → back /internal/*'
sent="smoke-$(rand)"
request api_health -H "X-Request-Id: $sent" "$BASE_URL/api/v1/health"
if [ "$(status api_health)" = 200 ] && grep -qi 'application/json' <<<"$(header api_health Content-Type)"; then
  ok "GET /api/v1/health → 200 JSON del back"
else
  fail "GET /api/v1/health → $(status api_health) ($(header api_health Content-Type)), se esperaba 200 JSON del back" "$(body api_health | head -c 200)"
fi
got="$(header api_health X-Request-Id)"
[ "$got" != "$sent" ] && is_nginx_id "$got" && ok "respuesta del back con el X-Request-Id de Nginx, no el del cliente" \
  || fail "X-Request-Id inesperado en una respuesta del back" "enviado=$sent recibido=$got"
[ "$(grep -ci '^X-Request-Id:' "$TMP/api_health.headers")" = 1 ] || fail "la respuesta trae X-Request-Id duplicado"

missing="__smoke_$(rand)"
sent="smoke-$(rand)"
request api_404 -H "X-Request-Id: $sent" "$BASE_URL/api/v1/$missing?lat=-34.9&lng=-56.1"
if [ "$(status api_404)" = 404 ] && { grep -q "/internal/$missing" "$TMP/api_404.body" || grep -q '"code":"NOT_FOUND"' "$TMP/api_404.body"; }; then
  ok "ruta inexistente /api/v1/$missing → 404 del back"
else
  fail "ruta inexistente → $(status api_404), se esperaba el 404 del back" "$(body api_404 | head -c 200)"
fi
# El requestId del body lo pone Express con el header que recibió: muestra qué llegó al back.
edge_id="$(header api_404 X-Request-Id)"
back_id="$(json_field api_404 requestId)"
if [ -n "$back_id" ] && [ "$back_id" != "$sent" ] && [ "$back_id" = "$edge_id" ] && is_nginx_id "$back_id"; then
  ok "el X-Request-Id del cliente no llega al back (el back recibió el de Nginx: $back_id)"
else
  fail "el back no recibió el X-Request-Id generado por Nginx" "enviado=$sent back=$back_id header=$edge_id"
fi
if $local_checks; then
  line="$(nginx_log_line "$edge_id")"
  if grep -q "\"upstreamPath\":\"/internal/$missing\"" <<<"$line" && grep -q '"upstreamStatus":"404"' <<<"$line"; then
    ok "[local] el access log muestra que llegó al back como /internal/$missing"
  else
    fail "[local] no se encontró /internal/$missing con respuesta del back en el access log" "$line"
  fi
  if [ -n "$line" ] && ! grep -qF -e 'lat=' -e 'lng=' -e '-56.1' <<<"$line"; then
    ok "[local] el access log no incluye la query string"
  else
    fail "[local] el access log incluye la query string (o no se encontró la línea)" "$line"
  fi
else
  skip "[local] path reescrito y query string en el access log"
fi

request internal "$BASE_URL/internal/health"
if [ "$(status internal)" = 404 ] && grep -q '"code":"NOT_FOUND"' "$TMP/internal.body"; then
  ok "/internal/* no se publica (404 JSON de Nginx)"
else
  fail "GET /internal/health → $(status internal), se esperaba 404" "$(body internal | head -c 200)"
fi

# ── WebSocket (Socket.io) ────────────────────────────────────────────
section 'WebSocket /api/v1/socket.io → back /internal/socket.io'
# Handshake de WebSocket de Engine.IO: el back responde 101 si Nginx pasa Upgrade/Connection. La autenticación de
# Socket.io viaja después, dentro del WebSocket, así que esto no necesita token. Después del 101 la conexión queda
# abierta: curl corta por --max-time y el código igual queda registrado.
ws_status="$(curl -sS --http1.1 --max-time 3 -o /dev/null -w '%{http_code}' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H "Sec-WebSocket-Key: $(head -c 16 /dev/urandom | base64)" \
  "$BASE_URL/api/v1/socket.io/?EIO=4&transport=websocket" 2>/dev/null)"
[ "$ws_status" = 101 ] && ok "upgrade a WebSocket → 101 del back" || fail "upgrade a WebSocket → $ws_status, se esperaba 101"
request ws_polling "$BASE_URL/api/v1/socket.io/?EIO=4&transport=polling"
[ "$(status ws_polling)" = 400 ] && ok "long-polling deshabilitado (solo WebSocket, ADR-0003) → 400" \
  || fail "long-polling → $(status ws_polling), se esperaba 400 (solo WebSocket)"

# ── Límite de body ───────────────────────────────────────────────────
section 'client_max_body_size'
head -c 1100000 /dev/zero | tr '\0' 'a' > "$TMP/big.txt"
request big -X POST -H 'Content-Type: text/plain' --data-binary "@$TMP/big.txt" "$BASE_URL/api/v1/$missing"
[ "$(status big)" = 413 ] && ok "body de ~1.1 MB → 413" || fail "body de ~1.1 MB → $(status big), se esperaba 413"

# ── Rate limit ───────────────────────────────────────────────────────
section 'Rate limit en /api/v1/auth/login'
login() { # login <nombre> [curl args extra...]
  local name="$1"; shift
  request "$name" -X POST -H 'Content-Type: application/json' --data '{}' "$@" "$BASE_URL/api/v1/auth/login"
}
codes=(); limited=''
for i in $(seq 1 15); do
  login "burst$i"
  codes+=("$(status "burst$i")")
  if [ "$(status "burst$i")" = 429 ]; then limited="burst$i"; break; fi
done
if [ -n "$limited" ]; then
  ok "ráfaga → 429 en el request ${#codes[@]} (${codes[*]})"
  grep -qi 'application/json' <<<"$(header "$limited" Content-Type)" && ok "429 con Content-Type JSON" \
    || fail "el 429 no es JSON ($(header "$limited" Content-Type))"
  grep -q '"code":"RATE_LIMITED"' "$TMP/$limited.body" && grep -q '"message":"' "$TMP/$limited.body" \
    && ok "body { code: 'RATE_LIMITED', message, requestId }" || fail "body del 429 inesperado" "$(body "$limited")"
  rid_body="$(json_field "$limited" requestId)"
  [ -n "$rid_body" ] && [ "$rid_body" = "$(header "$limited" X-Request-Id)" ] \
    && ok "requestId del body = header X-Request-Id" \
    || fail "requestId del body ($rid_body) distinto del header ($(header "$limited" X-Request-Id))"

  # Un cliente externo no puede evadir el límite inventando su X-Forwarded-For.
  login spoof -H "X-Forwarded-For: 198.51.100.$((RANDOM % 250 + 1))"
  [ "$(status spoof)" = 429 ] && ok "X-Forwarded-For de un cliente externo se ignora (sigue en 429)" \
    || fail "con un X-Forwarded-For inventado el cliente externo evadió el límite ($(status spoof))"

  # Login y registro comparten la zona estricta; las variantes de la URL de login también.
  # (La IP ya agotó la zona con la ráfaga: cualquier request de esa zona da 429.)
  for variant in auth/register auth/Login auth/LOGIN auth/login/ auth/Register/; do
    request variant -X POST -H 'Content-Type: application/json' --data '{}' "$BASE_URL/api/v1/$variant"
    [ "$(status variant)" = 429 ] && ok "/api/v1/$variant comparte el límite estricto (429)" \
      || fail "/api/v1/$variant → $(status variant), se esperaba 429 (zona estricta)"
  done

  # Refresh, logout y logout-all usan la zona general: siguen respondiendo (el back, no Nginx)
  # aunque login y registro de esta IP estén bloqueados.
  refresh_codes=()
  for i in $(seq 1 12); do
    request "refresh$i" -X POST -H 'Content-Type: application/json' --data '{}' "$BASE_URL/api/v1/auth/refresh"
    refresh_codes+=("$(status "refresh$i")")
  done
  if grep -qw 429 <<<"${refresh_codes[*]}"; then
    fail "/api/v1/auth/refresh quedó limitado por la zona estricta de login" "${refresh_codes[*]}"
  else
    ok "/api/v1/auth/refresh no está en la zona estricta: 12 requests seguidos sin 429 (${refresh_codes[0]})"
  fi
  for path in auth/logout auth/logout-all; do
    request out -X POST -H 'Content-Type: application/json' --data '{}' "$BASE_URL/api/v1/$path"
    [ "$(status out)" != 429 ] && ok "/api/v1/$path no está en la zona estricta ($(status out))" \
      || fail "/api/v1/$path → 429: no debería usar la zona estricta de login"
  done
else
  fail "15 requests seguidos no dieron 429" "${codes[*]}"
fi

# ── Panel /admin ────────────────────────────────────────────────────
section 'Panel /admin (estáticos con cabeceras de seguridad; la autorización es del back)'
request admin "$BASE_URL/admin/"
if [ "$(status admin)" = 200 ] && grep -qi 'text/html' <<<"$(header admin Content-Type)"; then
  ok "/admin/ → 200 HTML"
else
  fail "/admin/ → $(status admin) $(header admin Content-Type)"
fi
csp="$(header admin Content-Security-Policy)"
if grep -q "default-src 'none'" <<<"$csp" && grep -q "script-src 'self'" <<<"$csp" && grep -q "frame-ancestors 'none'" <<<"$csp"; then
  ok "CSP estricta (solo recursos propios, sin frames)"
else
  fail "falta la CSP del panel o no es estricta" "$csp"
fi
[ "$(header admin X-Frame-Options)" = DENY ] && ok "X-Frame-Options: DENY" || fail "falta X-Frame-Options: DENY" "$(header admin X-Frame-Options)"
[ "$(header admin X-Content-Type-Options)" = nosniff ] && ok "X-Content-Type-Options: nosniff" || fail "falta X-Content-Type-Options: nosniff"
[ "$(header admin Cache-Control)" = no-store ] && ok "Cache-Control: no-store" || fail "el panel se puede cachear" "$(header admin Cache-Control)"
[ -n "$(header admin X-Request-Id)" ] && ok "el panel también lleva X-Request-Id" || fail "/admin/ sin X-Request-Id (add_header de la location pisa el del server)"
request admin_js "$BASE_URL/admin/app.js"
if [ "$(status admin_js)" = 200 ] && grep -qi 'javascript' <<<"$(header admin_js Content-Type)"; then
  ok "/admin/app.js → 200 JavaScript (módulo)"
else
  fail "/admin/app.js → $(status admin_js) $(header admin_js Content-Type)"
fi
request admin_api "$BASE_URL/api/v1/admin/metrics"
if [ "$(status admin_api)" = 401 ] && [ "$(json_field admin_api code)" = UNAUTHENTICATED ]; then
  ok "/api/v1/admin/metrics sin token → 401 JSON (lo decide el back)"
else
  fail "/api/v1/admin/metrics sin token → $(status admin_api)" "$(body admin_api)"
fi

# ── IP real desde la red de confianza ───────────────────────────────
section 'Rate limit por IP real (X-Forwarded-For desde la red de confianza)'
if $local_checks; then
  ip_a="203.0.113.$((RANDOM % 120 + 1))"
  ip_b="203.0.113.$((RANDOM % 120 + 130))"
  # Contenedor efímero en la red de compose (misma imagen de Nginx, que trae curl).
  out="$(compose run --rm --no-deps -T --entrypoint sh nginx -c "
    url=http://nginx:8080/api/v1/auth/login
    post() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST -H 'Content-Type: application/json' --data '{}' \"\$@\" \$url; }
    for i in \$(seq 1 15); do printf '%s ' \"\$(post -H 'X-Forwarded-For: $ip_a')\"; done; echo
    post -H 'X-Forwarded-For: $ip_b' -D /tmp/b.headers; echo
    grep -i '^x-request-id:' /tmp/b.headers | cut -d' ' -f2 | tr -d '\\r'
  " 2>"$TMP/run.err")"
  codes_a="$(sed -n 1p <<<"$out")"; code_b="$(sed -n 2p <<<"$out")"; rid_b="$(sed -n 3p <<<"$out")"
  if grep -qw 429 <<<"$codes_a"; then ok "IP A ($ip_a) queda limitada ($codes_a)"; else fail "IP A no llegó a 429" "$codes_a $(cat "$TMP/run.err")"; fi
  if [ -n "$code_b" ] && [ "$code_b" != 429 ]; then ok "IP B ($ip_b) no se ve afectada por A ($code_b)"; else fail "IP B quedó limitada por la ráfaga de A ($code_b)" "$(cat "$TMP/run.err")"; fi
  line="$(nginx_log_line "$rid_b")"
  grep -q "\"remoteAddr\":\"$ip_b\"" <<<"$line" && ok "[local] Nginx registra la IP real del cliente ($ip_b)" \
    || fail "[local] el access log no muestra la IP real $ip_b" "$line"
else
  skip "requiere el entorno local de docker compose (base_url local y SMOKE_SKIP_LOCAL != 1)"
fi

# ── Resumen ──────────────────────────────────────────────────────────
printf '\n%d ok, %d fallidas, %d omitidas\n' "$PASSED" "$FAILED" "$SKIPPED"
if [ "$FAILED" -gt 0 ]; then
  printf '%sSMOKE TEST FALLIDO%s\n' "$C_FAIL" "$C_OFF"
  exit 1
fi
if $is_local && ! $local_checks && [ "${SMOKE_SKIP_LOCAL:-0}" != 1 ]; then
  printf '%sSin verificaciones [local]: no se encontró el servicio nginx de %s corriendo.%s\n' "$C_FAIL" "$COMPOSE_FILE" "$C_OFF"
  printf 'Levantá el entorno o usá SMOKE_SKIP_LOCAL=1 para omitirlas a propósito.\n'
  exit 1
fi
printf '%sSMOKE TEST OK%s\n' "$C_OK" "$C_OFF"
