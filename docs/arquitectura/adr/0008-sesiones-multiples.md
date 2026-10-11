# 0008 · Una sesión por dispositivo (colección `sessions`)

- **Estado:** Aceptada
- **Fecha:** 2026-10-11

## Contexto

El diseño original guardaba un único `users.refreshTokenHash`: iniciar sesión en un segundo teléfono reemplazaba el hash y dejaba el primero sin sesión. Un estudiante usa el teléfono y a veces una tablet o un teléfono de repuesto, así que ese límite no es aceptable. Además hay que poder cerrar la sesión de un dispositivo sin tocar las otras, y detectar el robo de un refresh token sin desloguear a la persona de todos lados.

## Decisión

Una colección `sessions` con una fila por login/dispositivo: `userId`, `sid`, `refreshTokenHash`, `deviceLabel?`, `lastUsedAt`, `expiresAt`, `revokedAt?`. Se elimina `users.refreshTokenHash`.

- Los tokens llevan `sid`; el refresh además lleva un `jti` aleatorio. El access token lleva `sid` para que `POST /auth/logout` sepa qué sesión cerrar sin recibir nada en el body.
- La rotación es **por sesión** y con una actualización condicional sobre el hash vigente (`findOneAndUpdate` con `{ sid, userId, refreshTokenHash, revokedAt: null, expiresAt > ahora }`): nunca "consultar y después actualizar". Dos refresh simultáneos con el mismo token no pueden ganar los dos.
- Reuso de un refresh viejo (firma válida, hash que no coincide) → se revoca **solo esa sesión** y 401.
- Máximo 5 sesiones activas por usuario. Al abrir una nueva se crea primero y después se recortan las más antiguas por `createdAt` (así la sesión nueva nunca es la revocada, y dos logins simultáneos convergen).
- `POST /auth/logout` cierra la sesión del access token; `POST /auth/logout-all`, todas.
- Un usuario `suspended` pierde todas sus sesiones: login y refresh las revocan. La suspensión desde `/admin` (S6) debe llamar a `authService.revokeAllSessions`.
- Índices (migración): `{ sid }` único, `{ userId }` y TTL sobre `expiresAt`. Las sesiones revocadas se conservan hasta el TTL para que el reuso de su refresh siga detectándose.

## Alternativas consideradas

- **Un hash por usuario** (lo que había) — una sola sesión; descartado por el motivo del contexto.
- **Lista de hashes dentro de `users`** — mezcla datos de perfil con credenciales de sesión, obliga a actualizar un array con operadores posicionales y no permite un TTL por sesión.
- **Familias de refresh tokens sin colección** (JWT sin estado) — no se puede revocar ni detectar el reuso.
- **Que `authenticate` consulte la sesión en cada request** — cierra la brecha del access token tras el logout, pero agrega una lectura a cada request. Se descartó: el access dura 15 minutos y el refresh queda inutilizado en el acto.

## Consecuencias

- Se gana: varios dispositivos, logout por dispositivo, reuso contenido a una sesión, y expiración automática (TTL).
- Se acepta: tras un logout el access token sigue valiendo hasta 15 minutos; dos refresh simultáneos con el mismo token cierran la sesión (por eso la app hace un solo refresh en vuelo).
- `deviceLabel` es solo una etiqueta; todavía no hay un endpoint para listar o cerrar sesiones individuales desde otro dispositivo.
- La migración que quita `refreshTokenHash` no es reversible en datos: quien la revierta tiene que volver a iniciar sesión.
