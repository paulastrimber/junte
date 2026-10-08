# junte

App móvil para descubrir y organizar planes universitarios: creá una actividad, encontrá las que tenés cerca y te interesan, inscribite, marcá asistencia con QR y ubicación, y chateá con quienes van.

## Componentes

| Carpeta | Qué es |
|---------|--------|
| `mobile/` | App React Native (Expo) |
| `front-service/` | Nginx: proxy, rate limit, panel `/admin` |
| `back-service/` | API Node.js + Express + Socket.io |
| `infra/` | Entorno local (docker-compose) y scripts de AWS |
| `docs/` | Arquitectura, buenas prácticas, backlog |

## Requisitos

- Node.js LTS (versión en `.nvmrc`)
- Docker + Docker Compose
- [Task](https://taskfile.dev/installation/)
- Expo / EAS CLI (`npx expo`, `npx eas`) y un teléfono Android con el development build

## Arranque local

```bash
task setup          # instala dependencias y crea back-service/.env
task up             # Nginx :8080, back, MongoDB (replica set), Redis
task db:migrate     # índices y validadores
task db:seed        # usuarios y planes de prueba en Montevideo
task mobile:start   # Expo; apuntá EXPO_PUBLIC_API_URL a http://<tu-ip>:8080/api/v1
```

Comprobar: `curl localhost:8080/health` → `ok`.

## Antes de un PR

```bash
task ci
```

## Documentación

Empezá por [`docs/README.md`](docs/README.md). Reglas rápidas en [`CLAUDE.md`](CLAUDE.md).
