# Pruebas en local

Cómo levantar todo en una máquina de desarrollo y validar a mano (o con un agente) lo que los tests automáticos no cubren: el entorno real con Docker, varias instancias del back y la app en el simulador de iOS o en un teléfono. Los tests automáticos están en [testing.md](testing.md).

## Entorno

```bash
task setup          # dependencias y .env (back-service/.env con JWT_SECRET y SEED_PASSWORD aleatorios, mobile/.env)
task up             # Nginx :8080, back :3000, MongoDB (replica set) y Redis
task db:migrate
task db:seed        # usuarios y planes de prueba en Montevideo
task down           # al terminar (también baja la segunda instancia del back)
```

Sin `task` instalado se pueden correr los mismos comandos del [Taskfile](../../Taskfile.yml) a mano (por ejemplo `docker compose -f infra/docker-compose.dev.yml up -d --build --wait`).

### URL de la API en la app (`mobile/.env`)

`EXPO_PUBLIC_API_URL` depende de dónde corre la app. `mobile/.env` no se commitea: cada uno lo deja apuntando a donde prueba.

| Dónde corre la app | `EXPO_PUBLIC_API_URL` |
|--------------------|-----------------------|
| Simulador de iOS | `http://localhost:8080/api/v1` |
| Emulador de Android | `http://10.0.2.2:8080/api/v1` (valor de `.env.example`) |
| Teléfono físico (misma Wi-Fi) | `http://<IP LAN de la máquina>:8080/api/v1` (`ipconfig getifaddr en0` en macOS) |

Cambiar la URL requiere reiniciar Metro con `--clear` (la variable queda dentro del bundle).

### Puerto 8080 ocupado por otro servicio

Nginx publica el `8080` en todas las interfaces. Si otro programa escucha en `127.0.0.1:8080` (pasó con un **Jenkins de Homebrew**, `jenkins-lts`), `localhost` puede llegar a ese programa en lugar de a Nginx: con IPv6 (`::1`) responde Nginx y con IPv4 (`127.0.0.1`) el otro. Se nota cuando la app recibe 404 que no son del back o páginas HTML.

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN     # quién escucha
brew services stop jenkins-lts       # si es el Jenkins de Homebrew (también le saca el arranque automático)
```

## Pruebas de aceptación con Docker

| Prueba | Comando | Qué valida |
|--------|---------|-----------|
| Chat entre instancias (S5-BE-05) | `task chat:two-instances` | Levanta una segunda instancia del back (perfil `scale`, puerto 3001) y comprueba que un mensaje enviado a la instancia A llega a un cliente conectado a la B (adaptador de Redis). |
| Jobs con dos instancias (S4-BE-08) | Con la segunda instancia arriba: `docker compose -f infra/docker-compose.dev.yml --profile scale logs back back-2 \| grep job` | En cada ciclo una instancia loguea `job started` y la otra `job skipped: another instance has the lock`. |
| Front service | `task front:check` y `task front:smoke` | `nginx -t`, proxy, `requestId`, rate limit, IP real y el upgrade a WebSocket (101; long-polling rechazado con 400). |

`smoke.sh` agota a propósito el rate limit de `/auth/login` y `/auth/register` de la IP de la máquina (10 por minuto): si después hay que registrar usuarios de prueba, esperar un minuto.

## App en el simulador de iOS

Requisitos: macOS con **Xcode** instalado en `/Applications/Xcode.app` y un simulador de iPhone. Se prueba con **Expo Go** (no hace falta un development build). Lo que necesita un development build (push, mapa de Android con su clave) no se puede probar así.

```bash
cd mobile
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npx expo start --go --ios
```

- **`DEVELOPER_DIR`**: si `xcode-select -p` apunta a las Command Line Tools, `xcrun simctl` no existe y Expo no puede abrir el simulador. La variable usa el Xcode completo sin cambiar la configuración del sistema (`sudo xcode-select -s …` también sirve, pero es global).
- **`--go`**: el proyecto tiene `expo-dev-client`, así que por defecto Expo espera un development build. Con `--go` abre Expo Go; la primera vez lo descarga (build oficial de Expo para el simulador) y lo instala.
- **No usar `--localhost`**: Metro queda escuchando solo en IPv6 (`::1`) y Expo Go en el simulador lo busca en `127.0.0.1` ("Could not connect to development server"). Sin esa opción Metro escucha en todas las interfaces y se abre con `exp://127.0.0.1:8081`.
- Para recargar la app sin tocar el simulador: cerrar y volver a abrir Expo Go (`xcrun simctl terminate booted host.exp.Exponent` y `xcrun simctl openurl booted exp://127.0.0.1:8081`, con el mismo `DEVELOPER_DIR`).

### Probar con un agente

El simulador se puede manejar desde el panel de simulador de la app de Claude (capturas, toques, texto). Lo que aprendimos al probar el chat (S5, 2026-10-14):

- **Las capturas llegan atrasadas**: después de un toque, sacar dos capturas y actuar sobre la última.
- **No escribir sin un campo con foco**: las teclas que llegan a la raíz de la app son atajos de Expo (la `r` recarga la app).
- **El teclado en pantalla no se ve**: el texto entra como teclado físico, así que "el teclado no tapa el campo" hay que mirarlo a mano (simulador con la app Simulator abierta o teléfono).
- **El autocorrector de iOS sí actúa** con el teclado físico: sirve para probar casos como "enviar con una sugerencia pendiente".
- La otra persona de un chat o un plan se simula por REST y Socket.io contra el back local (scripts de Node con `fetch` y `socket.io-client`). Usuarios de prueba con emails `@test.junte.invalid`, creados con pausas de unos segundos por el rate limit.
- Para simular una caída de red: `docker compose -f infra/docker-compose.dev.yml stop nginx` y después `start nginx`. Revisar antes que nada más escuche en el 8080 (ver arriba): si no, la "caída" devuelve las respuestas de ese otro programa.

## App en un teléfono

```bash
cd mobile && npx expo start --go     # escanear el QR con Expo Go, en la misma Wi-Fi
```

Con `mobile/.env` apuntando a la IP LAN de la máquina. Es la única forma de ver el teclado real, la cámara (QR) y el GPS.

## Checklist manual del chat

1. El botón "Chat del plan" aparece en el detalle solo para el creador y los inscriptos; el chat abre con el título del plan y, si no hay mensajes, el estado vacío.
2. Un mensaje de otra persona aparece sin refrescar; uno propio se ve "enviando" y después confirmado, una sola vez.
3. Enviar está deshabilitado con el campo vacío o con solo espacios; después de enviar el campo queda vacío (también con una sugerencia del autocorrector pendiente).
4. Al subir se cargan los mensajes anteriores, sin duplicados.
5. Con Nginx caído aparece el aviso "Sin conexión en tiempo real: actualizamos cada 5 s"; un envío queda "No se envió · Reintentar" y, al volver, se manda una sola vez.
6. Si la persona se da de baja con el chat abierto, deja de recibir mensajes y al intentar enviar ve el error de acceso.
7. El teclado no tapa el campo (solo en teléfono o con el teclado en pantalla).
