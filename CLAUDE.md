# CLAUDE.md

Guía para trabajar en **junte**, una app móvil de planes universitarios: crear planes, consultar actividades cercanas, inscribirse, registrar asistencia (QR + ubicación), chatear por plan y reportar contenido.

La fuente de verdad del diseño es el *Informe de arquitectura técnica* (entrega prevista: 23/09/2026). Los contratos y reglas son una propuesta preliminar: si algo no está definido acá o en el informe, preguntar antes de inventarlo.

## Stack

- **Móvil:** React Native (Expo + EAS Build). No accede nunca a MongoDB, solo a la API.
- **Backend:** Node.js + Express + Socket.io, validación con Zod, JWT propio (bcrypt o Argon2 para contraseñas).
- **Base de datos:** MongoDB en EC2 privada, configurada como **replica set** (requisito para transacciones).
- **AWS:** VPC, ALB público (TLS termina acá), EC2 privadas, S3 privado, Secrets Manager, CloudWatch, Session Manager.
- **Push:** Firebase Cloud Messaging.
- **Fuera de alcance:** Lambda, API Gateway, DynamoDB, Kubernetes, Cognito.

## Estructura del repositorio

```
mobile/
  screens/       # LoginScreen, HomeScreen, PlanScreen, CreatePlanScreen...
  components/    # UI reutilizable
  services/      # HTTP, Socket.io, auth, FCM, persistencia offline
  navigation/
  hooks/
  utils/
  tests/
backend/
  routes/        # método + URL
  middlewares/   # auth JWT, rate limit, requestId, errores
  controllers/   # adapta req/res, sin lógica de negocio
  services/      # reglas de negocio
  models/        # esquemas y acceso a MongoDB
  validators/    # esquemas Zod
  config/        # carga de configuración (sin secretos)
  tests/
```

Flujo de una request: `ruta → middleware → controlador → servicio → modelo → MongoDB`. La lógica de negocio vive en `services/`, no en controladores ni rutas.

## Convenciones de la API

- Prefijo `/api/v1`. JSON en request y response.
- Todas las rutas de negocio requieren `Authorization: Bearer <access_token>`. Públicas: `/auth/register`, `/auth/login`, `/auth/refresh` y `GET /health` (sin prefijo, para el ALB, devuelve 200/503).
- Fechas en ISO 8601 con zona horaria; IDs como strings; **nombres de campos en inglés**.
- Paginación: `limit` (default 20, máx 100) y `cursor`; respuesta `{ items, nextCursor }` (`nextCursor: null` al final).
- Errores: `{ code, message, requestId }`. 400 validación, 401 token ausente/inválido/vencido, 403 sin permiso, 404 inexistente, 409 conflicto (cupo, duplicado, estado), 429 rate limit, 500 sin detalles sensibles.
- Coordenadas GeoJSON: `[longitud, latitud]`, en ese orden.

Endpoints: `auth/*`, `users/me` (+ `/photo`), `plans` (GET/POST), `plans/:id` (GET/PATCH), `plans/:id/join` (POST/DELETE), `plans/:id/qr`, `plans/:id/check-in`, `plans/:id/messages` (GET/POST), `plans/:id/photo`, `reports`, `uploads/presign`. Ver sección 3.2 del informe para parámetros, permisos y códigos de error de cada uno.

## Modelo de datos (MongoDB)

Colecciones: `users`, `plans`, `planParticipants`, `checkIns`, `messages`, `reports`, `deviceTokens`. Todas con `createdAt`/`updatedAt`, referencias por `ObjectId`.

Índices obligatorios:
- `users.email` único
- `plans`: `{ status, startsAt }` y `2dsphere` en `location`
- `planParticipants` único en `{ planId, userId }` (un registro por par, reactivable)
- `checkIns` único en `{ planId, userId }`
- `messages`: `{ planId, createdAt, _id }`
- `reports`: `{ status, createdAt }`
- `deviceTokens.token` único

## Reglas de negocio que no se pueden romper

- **Identidad desde el token, nunca desde el body.** `creatorId`, `senderId`, `userId`, `reporterId` los setea el backend.
- **Campos solo-backend:** `reputation`, `noShow`, `noShowAt`, `participantCount`, `university` del plan. Rechazarlos o ignorarlos si vienen del cliente.
- **Cupos:** inscripción y baja actualizan `participantCount` condicionalmente **y** el registro en `planParticipants` dentro de la **misma transacción**. Nunca "consultar y después insertar".
- Crear un plan no consume cupo; el creador debe inscribirse si quiere participar.
- `PATCH /plans/:id` con `capacity` menor a los inscriptos → 409.
- **Check-in:** requiere inscripción activa, ventana horaria (`checkInOpensAt`/`checkInClosesAt`), QR válido y no vencido, y distancia ≤ `checkInRadiusMeters`. El QR es un desafío aleatorio con vencimiento (se guarda `qrNonceHash`), no el ID del plan. No persistir la ubicación exacta del participante: solo `distanceMeters` y `accuracyMeters`.
- **Reputación:** +1 por check-in válido. Al cerrar/completar un plan, marcar `noShow=true` en inscripciones activas sin check-in.
- **Chat:** solo participantes activos o el creador. Socket.io autentica la conexión y verifica pertenencia al plan; REST de mensajes sirve para historial y fallback por polling. Texto de 1 a 2000 caracteres.
- **Permisos:** un usuario solo edita su perfil y sus inscripciones; solo el creador edita el plan y genera el QR; los reportes no se exponen a otros usuarios; `/admin` requiere permisos específicos.

## Feed de recomendación

Candidatos con `$near` dentro de `radiusKm`, luego:

```
score = 0.5 * Jaccard(intereses usuario, intereses plan)
      + 0.3 * P(d)      // 1 en distancia 0, lineal hasta 0 en radiusKm
      + 0.2 * H(u, p)   // 1 sin superposición de calendario, 0 con superposición, 0.5 sin permiso
```

Los pesos deben ser configurables sin cambiar el contrato de la API.

## Seguridad

- Validar con Zod todo input: enteros positivos, fechas coherentes, IDs válidos, longitudes máximas, coordenadas en rango. Construir las queries en el backend; **nunca** pasar filtros u operadores del cliente directo a MongoDB.
- JWT: verificar firma, algoritmo esperado, vencimiento, tipo de token y usuario activo. Access token de vida corta; refresh token rotado y revocable (se guarda `refreshTokenHash`).
- Secretos (Mongo, firma JWT, FCM) en Secrets Manager, leídos con el rol de la instancia. Nada de secretos en el código, Git ni el binario móvil. Mantener un `.env.example` con nombres de variables sin valores.
- Fotos: bucket S3 privado, URLs firmadas de corta duración; verificar tipo, tamaño, contenido y dueño antes de vincular `photoKey`. MongoDB guarda la clave del objeto, no la imagen.
- Logs: incluir `requestId`, estado y duración. **No** loguear contraseñas, tokens, coordenadas exactas ni bodies completos.
- Móvil: tokens en almacenamiento seguro del SO (p. ej. `expo-secure-store`), nunca en logs.
- El backend no guarda estado de sesión local (para poder escalar horizontalmente más adelante).

## Red y despliegue

- App → ALB: HTTPS/WSS 443. ALB → backend: HTTP 3000. Backend → MongoDB: TCP 27017.
- Security Groups: `sg-alb` (443 desde Internet), `sg-backend` (3000 solo desde `sg-alb`), `sg-db` (27017 solo desde `sg-backend`). Sin IP pública en las EC2, sin puerto 22 abierto: administración por Session Manager.
- Salida del backend vía NAT (dependencias, FCM) y/o VPC endpoints.
- Móvil: perfiles EAS separados (development, preview, production); URLs de API/Socket.io por entorno. Probar push con un development build (Expo Go no las soporta). Entrega académica: APK de Android.

## Tests

Priorizar: validaciones, propiedad del plan (403 sobre plan ajeno), token vencido (401), inscripciones concurrentes que no superen el cupo ni dupliquen, QR vencido / inscripción inactiva / fuera de radio que impidan el check-in, y contratos HTTP.

## Plan de sprints (1 semana c/u)

1. Base técnica: estructura, modelos e índices, infraestructura AWS, `/health` por HTTPS.
2. Auth y perfiles: registro/login/refresh, middleware JWT, pantallas, fotos en S3.
3. Planes y feed por cercanía: CRUD, `$near`, paginación, recomendación, calendario.
4. Inscripciones, asistencia y reputación: transacciones de cupo, QR, check-in, `noShow`.
5. Chat y notificaciones: Socket.io, fallback REST, notas de voz, FCM y `deviceTokens`.
6. Admin y comportamiento móvil: `/admin`, offline + sincronización, CloudWatch, backups.
7. Validación y entrega: e2e, seguridad, concurrencia, restauración, APK.
