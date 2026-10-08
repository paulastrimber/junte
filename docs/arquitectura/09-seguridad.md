# 09 · Seguridad

Referencia: OWASP Top 10 (web) y OWASP API Security Top 10. Cada control indica qué capa lo aplica.

## Autenticación (back service)

| Tema | Regla |
|------|-------|
| Contraseñas | Argon2id (o bcrypt costo ≥ 12). Mínimo 8 caracteres. Nunca se loguean ni se devuelven |
| Email | Normalizado (trim + minúsculas) antes de guardar y de buscar |
| Login | Mensaje de error idéntico para "no existe" y "contraseña incorrecta" (no revelar cuentas) |
| Access token | JWT, vida corta (propuesta: 15 min). Claims: `sub` (userId), `typ: 'access'`, `iat`, `exp` |
| Refresh token | JWT con `typ: 'refresh'` y `jti` aleatorio, vida larga (propuesta: 30 días). Se guarda **solo su hash** en `users.refreshTokenHash` |
| Rotación | Cada `/auth/refresh` emite un par nuevo y reemplaza el hash. Si llega un refresh válido pero que **no coincide** con el hash guardado (reuso de uno viejo) → se revoca la sesión (hash a `null`) y 401 |
| Firma | HS256 con secreto fuerte de Secrets Manager. Al verificar se **fija el algoritmo** (`algorithms: ['HS256']`) para impedir `alg: none` o confusión de algoritmos |
| Verificación | Middleware `authenticate`: firma, algoritmo, `exp`, `typ === 'access'`, usuario existe y `status === 'active'`. Decodificar sin verificar **no** autentica |

> Límite conocido: con un único `refreshTokenHash` por usuario, iniciar sesión en un segundo teléfono invalida el primero. Ver [pendientes](../pendientes.md#sesiones-múltiples).

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

1. `POST /uploads/presign` valida `contentType` (lista blanca: `image/jpeg`, `image/png`, `image/webp`) y `sizeBytes` (máx. propuesto 5 MB); genera una `objectKey` con prefijo del dueño (`users/<userId>/…` o `plans/<planId>/…`) y una URL `PUT` firmada de pocos minutos.
2. La app sube directo a S3.
3. `PUT /users/me/photo` o `/plans/:id/photo` verifica que la clave le pertenece, que el objeto existe (`HeadObject`), tipo y tamaño reales, y recién ahí guarda `photoKey`.
4. Lectura con URL `GET` firmada de corta duración. El bucket bloquea todo acceso público.

## Secretos

- MongoDB, firma JWT y credenciales FCM en **Secrets Manager**, leídos con el rol IAM de la instancia (permiso solo sobre esos secretos).
- Nada de secretos en el código, Git, logs ni en el binario móvil (`EXPO_PUBLIC_*` es público por definición).
- `.env.example` con nombres sin valores; `.env` en `.gitignore`.
- El usuario de MongoDB de la app solo tiene permisos `readWrite` sobre su base. Las migraciones pueden usar un usuario con permisos de índices.

## Borde (Nginx)

IP real vía `X-Forwarded-For` (sin esto el rate limit es global), rate limiting más estricto en `/auth/*`, `client_max_body_size`, `X-Request-Id` generado por Nginx (pisa el del cliente). Ver [04-front-service.md](04-front-service.md).

## Logs

Incluyen `requestId`, método, ruta, status, duración, `userId` cuando hay. **Nunca**: contraseñas, tokens, `Authorization`, coordenadas exactas, cuerpos completos, `qrToken`. Ver [errores-y-logs.md](../practicas/errores-y-logs.md).

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
- [ ] Búsqueda en logs de CloudWatch de `password`, `Bearer`, `refreshToken`: sin resultados.
