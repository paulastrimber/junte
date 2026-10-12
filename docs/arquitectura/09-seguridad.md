# 09 · Seguridad

Referencia: OWASP Top 10 (web) y OWASP API Security Top 10. Cada control indica qué capa lo aplica.

## Autenticación (back service)

| Tema | Regla |
|------|-------|
| Contraseñas | Argon2id (19 MiB, 2 pasadas, 1 hilo: mínimo de OWASP) detrás del adapter `passwordHasher`. Mínimo 8 caracteres, máximo 128. Nunca se loguean ni se devuelven |
| Email | Normalizado (trim + minúsculas) antes de guardar y de buscar |
| Login | Mensaje de error idéntico para "no existe" y "contraseña incorrecta" (no revelar cuentas); con un email inexistente igual se verifica un hash para no distinguir por tiempo de respuesta. Un hash con formato inválido es `INVALID_CREDENTIALS`, no un 500. `ACCOUNT_SUSPENDED` solo se revela a quien conoce la contraseña |
| Access token | JWT HS256, vida corta (15 min). Claims: `sub` (userId), `sid` (sesión), `typ: 'access'`, `iat`, `exp`. El rol **no** viaja en el token |
| Refresh token | JWT HS256 con `typ: 'refresh'`, `sid`, `jti` aleatorio, vida larga (30 días). Se guarda **solo su hash** (sha256) en `sessions.refreshTokenHash` |
| Sesiones | Una por login/dispositivo, en la colección `sessions` ([ADR-0008](adr/0008-sesiones-multiples.md)). Máximo 5 activas por usuario: al abrir la sexta se revoca la más antigua. `POST /auth/logout` cierra la sesión del access token; `POST /auth/logout-all` cierra todas |
| Rotación | Cada `/auth/refresh` emite un par nuevo y reemplaza el hash **de esa sesión** con una actualización condicional sobre el hash vigente (sin "consultar y después actualizar"). Si llega un refresh con firma válida pero que **no coincide** con el hash vigente (reuso de uno viejo), o la sesión está revocada o vencida → se revoca **solo esa sesión** y 401. Dos refresh simultáneos con el mismo token: gana uno, el otro se trata como reuso |
| Usuario suspendido | `authenticate` responde 401 `ACCOUNT_SUSPENDED`; login y refresh revocan **todas** sus sesiones. Cuando un admin suspende (S6) debe llamar a `authService.revokeAllSessions(userId)` |
| Firma | Secreto fuerte (≥ 32 caracteres) de Secrets Manager. Al verificar se **fija el algoritmo** (`algorithms: ['HS256']`) para impedir `alg: none` o confusión de algoritmos |
| Verificación | Middleware `authenticate`: firma, algoritmo, `exp`, `typ === 'access'`, usuario existe y `status === 'active'`. Decodificar sin verificar **no** autentica. Un access vencido es `TOKEN_EXPIRED`; un refresh vencido es `UNAUTHENTICATED` (para que la app no reintente el refresh) |

> Límite conocido: `authenticate` no consulta la sesión (evita una lectura más por request), así que tras un `logout` el access token sigue valiendo hasta que vence (≤ 15 min). El refresh sí queda inutilizado en el acto.

## Autorización

| Regla | Dónde |
|-------|-------|
| Un usuario solo edita su perfil, sus inscripciones y sus `deviceTokens` | Servicio |
| Solo el creador edita el plan, sube su foto y genera el QR | Servicio (`assertCreator`) |
| Chat: participante activo o creador | Servicio (HTTP y Socket.io usan el mismo) |
| Check-in: inscripción activa + ventana + QR + distancia | Servicio de check-in |
| Reportes nunca visibles para otros usuarios | Servicio |
| `/admin/*` requiere `role: 'admin'` | Middleware `requireRole('admin')` + servicio |

Las comprobaciones de **propiedad** van en el servicio (no en el controlador), así se testean sin HTTP y Socket.io las reutiliza. Un recurso ajeno que el usuario no debería ni saber que existe responde 404, no 403 (p. ej. reportes).

## Validación de entradas

- Zod en todo `params`, `query` y `body`, con `.strict()`.
- Reglas de dominio: enteros positivos, `startsAt` futuro, `checkInClosesAt > checkInOpensAt`, longitud ∈ [-180, 180], latitud ∈ [-90, 90], `ObjectId` válido, longitudes máximas de strings, `interests` con tope de cantidad.
- **Nunca** se pasa un objeto del cliente como filtro u operador a MongoDB (inyección NoSQL: `{ "email": { "$ne": null } }`). Las queries se construyen en el repositorio con valores ya validados. Mongoose con `sanitizeFilter: true` como red adicional.

## QR de asistencia

- `POST /plans/:id/qr` genera un nonce de 32 bytes aleatorios (`crypto.randomBytes`), guarda `qrNonceHash = sha256(nonce)` y `qrExpiresAt`, devuelve el `qrToken` al creador.
- El check-in compara `sha256(qrToken)` con el hash usando `crypto.timingSafeEqual`, verifica que no venció, que el `planId` coincide y la ventana horaria.
- Distancia con fórmula de Haversine (función pura, testeada) ≤ `checkInRadiusMeters` y `accuracyMeters` ≤ máximo aceptado.
- Límite documentado: un QR compartido o una ubicación simulada no son una garantía absoluta contra fraude.

## Fotos (S3)

1. `POST /uploads/presign` valida `contentType` (lista blanca: `image/jpeg`, `image/png`, `image/webp`) y `sizeBytes` (1 byte a 5 MB); **genera el back** una `objectKey` con prefijo del dueño (`users/<userId>/<uuid>.<ext>`, o `plans/<planId>/<uuid>.<ext>` si se manda `planId`, que solo acepta al creador de ese plan) y una URL `PUT` de 5 minutos con tipo y tamaño firmados. El cliente nunca elige la clave.
2. La app sube directo a S3 con exactamente ese `Content-Type` y ese tamaño, y **sin** `Authorization` (la firma va en la URL).
3. `PUT /users/me/photo` (o `/plans/:id/photo`) verifica, en este orden, que la clave cuelga del prefijo del usuario —o del plan, después de comprobar que quien llama es su creador— (403 si no), que el objeto existe (`HeadObject`, 404 si no), y su tipo y tamaño **reales** (400 y se borra el objeto si no cumple); recién ahí guarda `photoKey` y borra la foto anterior.
4. Lectura con URL `GET` firmada de 10 minutos en cada respuesta del perfil (`photoUrl`). El bucket bloquea todo acceso público.
5. Credenciales: cadena por defecto del SDK / rol IAM de la instancia, nunca en el código ni en variables de la app. `S3_BUCKET` y `AWS_REGION` son obligatorias con `NODE_ENV=production`; sin ellas (desarrollo/test) se usa un storage en memoria.
6. Límite: `HeadObject` solo ve metadatos. La verificación del contenido (magic bytes) queda pendiente ([pendientes](../pendientes.md#d-notas-del-sprint-2)).

## Secretos

- MongoDB, firma JWT y credenciales FCM en **Secrets Manager**, leídos con el rol IAM de la instancia (permiso solo sobre esos secretos).
- Nada de secretos en el código, Git, logs ni en el binario móvil (`EXPO_PUBLIC_*` es público por definición).
- **Única excepción: la clave de Google Maps para Android** (`GOOGLE_MAPS_ANDROID_API_KEY`), que usa el mapa de "crear plan" (`react-native-maps`). El SDK de Google la lee del manifiesto de la app, así que **queda dentro del APK** y cualquiera puede extraerla: no se la trata como secreto sino como identificador restringido. Condiciones para aceptarla:
  - Restringida en Google Cloud a **esta app** (nombre de paquete de Android, `com.junte.app`, + huella SHA-1 del certificado de firma) y a la API **"Maps SDK for Android"** únicamente. Sin Places, Geocoding ni Directions: la búsqueda de direcciones usa el geocodificador del teléfono (`expo-location`).
  - Con cuota y alerta de facturación en el proyecto de Google Cloud.
  - No se commitea: va en `mobile/.env` en local y como variable de entorno del proyecto en EAS (no en `eas.json`). `app.config.js` la pasa al plugin de `react-native-maps` y corta el build de EAS si falta.
  - Una clave por entorno (development / preview / production), cada una con la huella de su certificado. En iOS el mapa usa Apple Maps y no necesita clave.
- `.env.example` con nombres sin valores; `.env` en `.gitignore`.
- El usuario de MongoDB de la app solo tiene permisos `readWrite` sobre su base. Las migraciones pueden usar un usuario con permisos de índices.

## Ubicación y calendario del usuario

- **Posición**: la app la manda solo en el feed (`POST /feed`, `GET /plans?near=`) y, más adelante, en el check-in. El back la usa para la consulta y **no la guarda ni la loguea** (el log de requests no incluye query string ni body). `distanceMeters` de cada plan va redondeada al metro.
- **Calendario**: la app lee el calendario del teléfono solo si la persona da permiso y manda únicamente **franjas ocupadas** (inicio y fin), nunca títulos, lugares ni invitados; el esquema de `POST /feed` rechaza cualquier campo extra. Va por body, no por query, para que no quede en los logs de acceso de Nginx ni del ALB. No se persiste. Sin permiso no se manda nada.
- Los filtros del feed son predefinidos (regla 8): el cliente elige valores de una lista cerrada (rangos de precio, cupo, intereses del catálogo, fechas) y el repositorio arma la consulta. El cursor de paginación es opaco, se valida con Zod al decodificarlo y uno manipulado es 400.

## Borde (Nginx)

IP real vía `X-Forwarded-For` (sin esto el rate limit es global), rate limiting estricto solo en `POST /auth/login` y `/auth/register` (refresh, logout y logout-all usan la zona general), `client_max_body_size`, `X-Request-Id` generado por Nginx (pisa el del cliente). Ver [04-front-service.md](04-front-service.md).

## Logs

Incluyen `requestId`, método, ruta, status, duración, `userId` cuando hay. **Nunca**: contraseñas, tokens, `Authorization`, coordenadas exactas, cuerpos completos, `qrToken`, URLs firmadas de S3, y los datos personales del perfil (`birthDate`, `neighborhood`, `city`). Ver [errores-y-logs.md](../practicas/errores-y-logs.md).

## Red

Ninguna EC2 con IP pública ni puerto 22 abierto (Session Manager). Cadena de Security Groups en [02](02-comunicacion-y-red.md#matriz-de-security-groups). Tramos internos sin TLS: límite documentado.

## Checklist de verificación (sprint 7)

- [ ] Internet no alcanza 8080, 3000, 6379, 27017 ni 22.
- [ ] Token vencido → 401; plan ajeno → 403; reporte ajeno → 404.
- [ ] Ráfaga de requests → 429 desde Nginx con `requestId`, sin afectar a otros usuarios.
- [ ] Body con operador Mongo (`$ne`, `$gt`) → 400.
- [ ] Campos solo-backend en el body → 400.
- [ ] QR vencido, inscripción inactiva o fuera de radio → check-in rechazado.
- [ ] Fotos inaccesibles sin URL firmada.
- [ ] Búsqueda en logs de CloudWatch de `password`, `Bearer`, `refreshToken`, `birthDate`: sin resultados.
