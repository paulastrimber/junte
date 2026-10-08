# 0004 · `role` y `status` en la colección `users`

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

El informe pide un panel `/admin` con "autorización administrativa en Express" y que el middleware JWT verifique el "estado del usuario", pero `users` no tenía ningún campo para ninguna de las dos cosas. Sin eso no hay forma de autorizar a un moderador ni de suspender una cuenta.

## Decisión

Agregar a `users`:

- `role: 'user' | 'admin'` (default `'user'`).
- `status: 'active' | 'suspended'` (default `'active'`).

Ambos son campos solo-backend. `requireRole('admin')` protege `/admin/*`. `authenticate` rechaza usuarios `suspended` con 401. El primer admin se crea con un seed/script operativo, nunca por la API pública. El rol **no** viaja en el JWT: se lee del usuario en cada request (ya se busca para verificar `status`), así un cambio de rol o una suspensión tiene efecto inmediato.

## Alternativas consideradas

- **Lista de emails admin en configuración**: frágil y requiere redeploy.
- **Rol dentro del JWT**: evita una lectura, pero el cambio de rol no aplica hasta que vence el token.

## Consecuencias

- Migración que agrega los campos con sus defaults a documentos existentes y el validador de enums.
- Hay que actualizar la sección 4.1 del informe.
