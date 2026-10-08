# JWT_SECRET sin valor fijo ni efímero

- **Autor:** @phillipbowles
- **Fecha:** 2026-10-08T00:22:35-03:00

## Prompt

No generes el JWT_SECRET en cada arranque: invalidaría todos los tokens en cada reinicio del contenedor. Hacelo así:

1. En `infra/back/dev-entrypoint.sh` sacá el valor fijo. El secreto tiene que llegar del `back-service/.env` que genera `task setup`, por `env_file` en el compose o como ya se cargue.
2. Si falta `JWT_SECRET`, el back no arranca y muestra un mensaje que diga que hay que correr `task setup`. Eso ya debería cubrirlo la validación de config con Zod.
3. En la validación de config agregá estas reglas para `JWT_SECRET`: mínimo 32 caracteres siempre, y en `NODE_ENV=production` rechazar cualquier valor que aparezca en el repo.
4. El valor fijo viejo queda en el historial de git. No reescribas el historial, porque era solo de desarrollo, pero dejá anotado en `pendientes.md` que ese valor no puede usarse nunca fuera de local.
5. Corré `task reset` o `task up`, después `task front:smoke` y `task ci`, y seguí con el resto de los pasos.
