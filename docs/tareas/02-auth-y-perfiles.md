# Sprint 2 · Autenticación y perfiles

**Objetivo:** un usuario se registra, inicia sesión, mantiene la sesión y completa su perfil con foto desde el teléfono.

**Entregable:** registro, login, refresh y logout; middleware JWT; pantallas de acceso y perfil; tokens en almacenamiento seguro; foto en S3.

**Decidido:** [sesiones múltiples](../pendientes.md#sesiones-múltiples) ([ADR-0008](../arquitectura/adr/0008-sesiones-multiples.md)), [fecha de nacimiento y ubicación](../pendientes.md#fecha-de-nacimiento-y-ubicación-del-perfil) y [perfil completo](../pendientes.md#perfil-completo). Lo que apareció al implementar: [notas del sprint 2](../pendientes.md#d-notas-del-sprint-2).

**Estado:** back y Nginx ✅ (tests, `task ci` y smoke test). App ✅ con tests, lint, `expo-doctor` y `expo export`, pero **sin probar en emulador ni teléfono** (ni la subida de la foto contra un bucket real).

## Back service

- [x] **S2-BE-01 · Hash de contraseñas** (Argon2id) detrás de un adapter `passwordHasher` (inyectable, rápido en tests).
- [x] **S2-BE-02 · `tokens`**: emitir/verificar access (`typ: access`, 15 min) y refresh (`typ: refresh`, `jti`, 30 días), algoritmo fijo HS256, secreto desde config.
  *Acepta:* tests unitarios: token vencido, otro algoritmo, `alg: none`, `typ` cambiado → rechazados.
- [x] **S2-BE-03 · `POST /auth/register`**: email normalizado, `EMAIL_TAKEN` (traducido desde E11000 en el repositorio), devuelve usuario serializado + tokens.
- [x] **S2-BE-04 · `POST /auth/login`**: `INVALID_CREDENTIALS` idéntico para email inexistente y contraseña errónea; usuario `suspended` → `ACCOUNT_SUSPENDED`.
- [x] **S2-BE-05 · `POST /auth/refresh`** con rotación y detección de reuso (refresh viejo → revoca y 401).
- [x] **S2-BE-06 · `POST /auth/logout`** y **`POST /auth/logout-all`**: cierran la sesión del access token / todas las del usuario (el refresh queda revocado).
- [x] **S2-BE-07 · Middleware `authenticate`** (firma, algoritmo, `exp`, `typ`, usuario existe y `active`) y **`requireRole`**.
  *Acepta:* tests de contrato 401/403 sobre una ruta protegida de prueba.
- [x] **S2-BE-08 · `GET /users/me` y `PUT /users/me`**: solo `name`, `birthDate`, `university`, `neighborhood`, `city`, `interests`; cualquier otro campo (incluido `age`) → 400. `GET /users/me` sin 404. `isProfileComplete(user)` exportada para S3.
- [x] **S2-BE-09 · `POST /uploads/presign`** (tipo y tamaño en lista blanca, clave con prefijo del dueño, URL de pocos minutos) y **`PUT /users/me/photo`** (verifica dueño, existencia, tipo y tamaño reales con `HeadObject`). Adapter `storage` con S3 real y en memoria; el bucket todavía no existe (lo configura el equipo de AWS).
- [x] **S2-BE-10 · Serializer de usuario**: nunca expone `passwordHash` ni nada de sesiones; `age` calculada; `photoUrl` firmada de lectura; vista pública mínima.

## Front service

- [x] **S2-NG-01 · Límite estricto solo en `login` y `register`** (`refresh`, `logout` y `logout-all` usan la zona general), verificado con smoke test.

## App

- [x] **S2-MOB-01 · `services/auth.js`** con `expo-secure-store`; `AuthContext` (estado de sesión, login, logout).
- [x] **S2-MOB-02 · Refresh automático** en el cliente HTTP con **una sola** request de refresh en vuelo.
  *Acepta:* test del cliente: 3 requests concurrentes con token vencido → 1 refresh, 3 reintentos.
- [x] **S2-MOB-03 · LoginScreen y RegisterScreen** (validación local, errores por `code`, estados de carga).
- [x] **S2-MOB-04 · Navegación protegida**: stack de auth vs stack de app según sesión.
- [x] **S2-MOB-05 · ProfileScreen**: editar nombre, fecha de nacimiento (selector), universidad, barrio, localidad e intereses; subir foto (presign → PUT a S3 → confirmar).

## Pruebas obligatorias

Las de "Auth y permisos" y "Validación" de [testing.md](../practicas/testing.md#qué-se-testea-sí-o-sí).

## Sprint 2b · Catálogos y onboarding

**Objetivo:** el perfil se completa con opciones de catálogos (universidad, carrera, ciudad, barrio, intereses por categoría) y una persona nueva entra a un onboarding de 3 pasos, todo salteable. Decisiones y alcance en [ADR-0009](../arquitectura/adr/0009-catalogos-en-la-base.md) y [pendientes](../pendientes.md#e-notas-del-sprint-2b-catálogos-y-onboarding). El CRUD de los catálogos desde `/admin` queda para S6.

- [x] **S2b-BE-01 · Colecciones de catálogos** (`interestCategories`, `interests`, `universities`, `careers`, `cities`, `neighborhoods`) con validadores e índices por migración, y carga inicial automática (`seed-catalogs`, solo inserta; `npm run catalogs:sync`).
- [x] **S2b-BE-02 · Datos iniciales**: 8 categorías y 57 intereses (con `minAge`), 7 universidades con 250 carreras de grado relevadas de los sitios oficiales, Montevideo con sus 62 barrios (INE).
- [x] **S2b-BE-03 · `GET /catalogs`** (activos, anidados, con `version`).
- [x] **S2b-BE-04 · Perfil con keys de catálogo**: `university`, `career`, `city`, `neighborhood` e `interests` (máx. 10) validados contra los catálogos (existencia, estado, carrera de la universidad, barrio de la ciudad, edad mínima); "Otra" = `other`; al cambiar la universidad/ciudad se quita la carrera/barrio.
- [x] **S2b-BE-05 · Onboarding en el perfil**: `onboardingCompleted` (solo `true`) → `onboardingCompletedAt`. El registro pide solo nombre, email y contraseña.
- [x] **S2b-BE-06 · Migración de usuarios existentes** (texto libre → keys o `other`) y seeds con las keys nuevas (más un usuario con onboarding pendiente).
- [x] **S2b-MOB-01 · `SelectField`** (lista con buscador y "Otra"), `InterestPicker` (por categoría, con máximo y edad mínima) y `useCatalogs`.
- [x] **S2b-MOB-02 · Onboarding de 3 pasos** (`Paso X de 3`, Atrás, Siguiente/Finalizar, Saltar este paso, Más tarde) que se muestra mientras `onboardingCompleted` sea `false`.
- [x] **S2b-MOB-03 · Perfil con los mismos selectores** (reemplaza los campos de texto de barrio, localidad y universidad).
- [x] **S6 · Admin de catálogos** (listar, crear, renombrar, ordenar, activar/desactivar) con `catalogService.invalidate()`.

**Estado:** back ✅ (tests, `task ci`, migración sobre la base local). App ✅ con tests y lint, **sin probar en emulador ni teléfono**.
