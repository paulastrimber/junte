# Sprint 2 · Autenticación y perfiles

**Objetivo:** un usuario se registra, inicia sesión, mantiene la sesión y completa su perfil con foto desde el teléfono.

**Entregable:** registro, login, refresh y logout; middleware JWT; pantallas de acceso y perfil; tokens en almacenamiento seguro; foto en S3.

**Decidir antes:** [sesiones múltiples](../pendientes.md#sesiones-múltiples), [perfil completo](../pendientes.md#perfil-completo).

## Back service

- [ ] **S2-BE-01 · Hash de contraseñas** (Argon2id) detrás de un adapter `passwordHasher` (inyectable, rápido en tests).
- [ ] **S2-BE-02 · `tokens`**: emitir/verificar access (`typ: access`, 15 min) y refresh (`typ: refresh`, `jti`, 30 días), algoritmo fijo HS256, secreto desde config.
  *Acepta:* tests unitarios: token vencido, otro algoritmo, `alg: none`, `typ` cambiado → rechazados.
- [ ] **S2-BE-03 · `POST /auth/register`**: email normalizado, `EMAIL_TAKEN` (traducido desde E11000 en el repositorio), devuelve usuario serializado + tokens.
- [ ] **S2-BE-04 · `POST /auth/login`**: `INVALID_CREDENTIALS` idéntico para email inexistente y contraseña errónea; usuario `suspended` → `ACCOUNT_SUSPENDED`.
- [ ] **S2-BE-05 · `POST /auth/refresh`** con rotación y detección de reuso (refresh viejo → revoca y 401).
- [ ] **S2-BE-06 · `POST /auth/logout`** (❓ validar): revoca el refresh.
- [ ] **S2-BE-07 · Middleware `authenticate`** (firma, algoritmo, `exp`, `typ`, usuario existe y `active`) y **`requireRole`**.
  *Acepta:* tests de contrato 401/403 sobre una ruta protegida de prueba.
- [ ] **S2-BE-08 · `GET /users/me` y `PUT /users/me`**: solo `name`, `university`, `interests`; cualquier otro campo → 400.
- [ ] **S2-BE-09 · `POST /uploads/presign`** (tipo y tamaño en lista blanca, clave con prefijo del dueño, URL de pocos minutos) y **`PUT /users/me/photo`** (verifica dueño, existencia, tipo y tamaño reales con `HeadObject`).
- [ ] **S2-BE-10 · Serializer de usuario**: nunca expone `passwordHash`, `refreshTokenHash`; `photoUrl` firmada de lectura.

## Front service

- [ ] **S2-NG-01 · Límite estricto en `/api/v1/auth/`** verificado con smoke test.

## App

- [ ] **S2-MOB-01 · `services/auth.js`** con `expo-secure-store`; `AuthContext` (estado de sesión, login, logout).
- [ ] **S2-MOB-02 · Refresh automático** en el cliente HTTP con **una sola** request de refresh en vuelo.
  *Acepta:* test del cliente: 3 requests concurrentes con token vencido → 1 refresh, 3 reintentos.
- [ ] **S2-MOB-03 · LoginScreen y RegisterScreen** (validación local, errores por `code`, estados de carga).
- [ ] **S2-MOB-04 · Navegación protegida**: stack de auth vs stack de app según sesión.
- [ ] **S2-MOB-05 · ProfileScreen**: editar datos, elegir intereses, subir foto (presign → PUT a S3 → confirmar).

## Pruebas obligatorias

Las de "Auth y permisos" y "Validación" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí).
