# Sprint 5 · Continuación (lo que queda fuera del código)

El código del sprint 5 está completo en el PR de `feat/S5-push-spot-alerts-voz`: avisos de cupo liberado (`spotAlerts`), `POST/DELETE /devices`, push por FCM (nuevo inscripto, cupo liberado y recordatorio), notas de voz y, en la app, push, botón "Avisarme si se libera un lugar", notas de voz e invitaciones por link. `task ci` pasa completo.

Lo que falta se hace **fuera del repo**: en AWS, en EAS y en un teléfono. Esta guía alcanza para seguir sin más contexto, teniendo el JSON de la cuenta de servicio de Firebase.

## Datos de Firebase

| Dato | Valor |
|------|-------|
| Proyecto | `junte-ebef4` |
| App Android | `com.junte.app` (App ID `1:564995347348:android:38052561b5a54a4e373581`) |
| Cuenta de servicio | `firebase-adminsdk-fbsvc@junte-ebef4.iam.gserviceaccount.com` |
| Clave | consola de Firebase → Configuración del proyecto → Cuentas de servicio → **SDK de Firebase Admin** → *Generar nueva clave privada* (el lenguaje elegido no importa). El back no usa el SDK: llama a la API HTTP v1 de FCM con esa clave. |

El JSON de la clave y `google-services.json` **nunca** van a Git, a logs ni a un chat compartido. Después de cargarlos, borrar las copias locales.

## A. Equipo de AWS

El permiso de lectura ya está en `infra/templates/00-base.yml` (`junte/${Env}/fcm-service-account-*`). No hace falta tocar IAM.

### A1. Crear el secreto (antes de A2)

```bash
aws secretsmanager create-secret \
  --name junte/dev/fcm-service-account \
  --secret-string file://<clave>.json \
  --region us-east-1
```

Para `entrega`, el mismo comando con `--name junte/entrega/fcm-service-account`. Puede ser la misma clave o una distinta, para poder revocarlas por separado. El valor es el JSON completo, sin modificar.

### A2. Pasar el nombre del secreto al back

Hecho (2026-11-05): `infra/templates/40-back.yml` tiene el parámetro `Push` (`enabled` / `disabled`, por defecto `disabled`). Con `enabled`, el UserData escribe `FCM_SERVICE_ACCOUNT_SECRET_ID=junte/<env>/fcm-service-account` en `/opt/junte/back.env`; con `disabled` la deja vacía y el back arranca sin push.

| Entorno | `Push` en `infra/parameters/<env>/40-back.json` |
|---------|------|
| `dev` | `enabled` |
| `entrega` | `disabled`: pasarlo a `enabled` después de crear el secreto en la cuenta B (A1) |

⚠️ Con `Push=enabled`, si el secreto no existe o no se puede leer, el back **no arranca**. Por eso A1 va primero en cada cuenta.

### A3. Desplegar (con el PR del sprint 5 ya en `main`)

1. Actualizar el stack del back y confirmar que las instancias se recrean con el UserData nuevo: `/opt/junte/back.env` tiene que tener la variable.
2. Desde `main` actualizado: `task back:release ENV=dev`. Aplica las migraciones pendientes; las del sprint 5 son `spotAlerts`, `plans.reminderSentAt` y notas de voz en `messages`.
3. En CloudWatch, al arrancar el back **no** tiene que aparecer `FCM_SERVICE_ACCOUNT not set: push notifications are disabled`.

### A4. WebSocket ocioso (S5-NG-01)

Los dos ALB ya tienen `idle_timeout.timeout_seconds = 300` y Nginx tiene el upgrade y `proxy_read_timeout 300s`, así que no hay que cambiar nada. Falta la prueba:

1. Con un build apuntando a `dev` (ver B2), abrir el chat de un plan y dejar el teléfono quieto más de 5 minutos.
2. Mandar un mensaje desde otro usuario: tiene que llegar al instante, sin reconexión. En los logs del back no tiene que aparecer un disconnect de ese socket.

Si pasa, tachar S5-NG-01 en [05-chat-y-notificaciones.md](05-chat-y-notificaciones.md) con la fecha.

## B. Equipo de la app

### B1. `google-services.json` en EAS: hecho (2026-11-04)

- Proyecto de EAS: `@man1111s-team/junte` (ID `fce23ad9-8c35-4b99-8399-5e390e72218b`). Ya está en `owner` y `extra.eas.projectId` de `app.config.js`.
- `GOOGLE_SERVICES_JSON` está cargada como variable de tipo archivo (visibilidad secret) en los entornos `development`, `preview` y `production`.
- **Falta `GOOGLE_MAPS_ANDROID_API_KEY`** en este proyecto de EAS. Sin ella, el mapa de "crear plan" se ve vacío en el APK. Quien tenga la clave (restringida a `com.junte.app` + SHA-1 en Google Cloud) la carga desde `mobile/`, en cada entorno:
  `npx eas-cli env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <clave> --environment <env> --visibility sensitive`.
  Después del primer build, sumar la huella SHA-1 del keystore de EAS (`npx eas-cli credentials -p android`) a la restricción de la clave.
- Para compilar en este proyecto hace falta una cuenta de Expo con acceso a `man1111s-team` (pedirle a @mperez14ang que invite) y `npx eas-cli login`.

#### Compilar con otra cuenta de Expo (sin estar en el team)

No hay que editar `app.config.js`:

1. En `mobile/.env` (o en la terminal): `EAS_OWNER=<tu cuenta de Expo>`.
2. `npx eas-cli login` y `npx eas-cli init` desde `mobile/`. Como la config es dinámica, `init` muestra el `projectId` sin escribirlo: copialo a `EAS_PROJECT_ID=` en `mobile/.env`.
3. Subir `google-services.json` (y la clave de Maps) a tu proyecto con los mismos `env:create`.

Tu APK va a quedar firmado con otra clave: los push andan igual, pero para el mapa hay que sumar tu SHA-1 a la restricción de la clave de Maps.

**Sin EAS:** con `mobile/google-services.json` y `mobile/.env` en su lugar, `npx expo run:android` compila e instala en el teléfono conectado.
- Si se regenera `google-services.json`: `npx eas-cli env:update --name GOOGLE_SERVICES_JSON --environment <env>` desde `mobile/`.
- En local, `app.config.js` lee `mobile/google-services.json` (ignorado por Git). Si no está, se baja de la consola de Firebase → Configuración del proyecto → app `com.junte.app`.

### B2. Build y prueba en un teléfono real (S5-MOB-04)

- Para probar contra AWS `dev` (después de A3), usar `preview`, que apunta a `https://api.dev.junteapp.me/api/v1`: `npx eas-cli build -p android --profile preview`. Los push funcionan en cualquier build instalado; lo único que no los soporta es Expo Go.
- `development` apunta a `10.0.2.2:8080`, que es el back local visto desde el emulador. Para un teléfono físico contra el back local hay que cambiar `EXPO_PUBLIC_API_URL` por la IP de la máquina en la red.

Qué probar, con dos cuentas y dos teléfonos (o teléfono + emulador):

1. Iniciar sesión y aceptar el permiso de notificaciones: el dispositivo queda registrado en `deviceTokens`.
2. Con la cuenta B, inscribirse en un plan de A: A recibe "nuevo inscripto".
3. Tocar la notificación con la app cerrada: abre el detalle del plan.
4. Llenar un plan, pedir "Avisarme si se libera un lugar" con otra cuenta y dar de baja a un inscripto: llega el aviso.
5. Recordatorio: plan que empieza en poco más de 1 hora, inscripto activo: llega el aviso (el job corre periódicamente).
6. Grabar, enviar y reproducir una nota de voz en el chat, también con la app en polling (sin WebSocket).
7. Compartir "Invitar a alguien" y abrir el link `junte://plans/<id>` en el otro teléfono.
8. Cerrar sesión: ese teléfono deja de recibir avisos de la cuenta.

Si todo pasa, tachar S5-MOB-04 en [05-chat-y-notificaciones.md](05-chat-y-notificaciones.md) con la fecha y anotar lo que haya fallado en [pendientes · H](../pendientes.md#h-notas-del-sprint-5-chat).

## Decisiones tomadas en el sprint (para revisar)

Están en [pendientes · H](../pendientes.md#h-notas-del-sprint-5-chat). Resumen:

- Los pedidos de aviso de cupo se conservan hasta que el usuario se inscribe, lo cancela, o el plan empieza o se cancela.
- Solo una baja dispara el aviso de cupo liberado. Subir `capacity` o reabrir el plan no avisa (límite conocido).
- Sin credencial de FCM el back arranca igual y no envía push (lo avisa en el log).
- Recordatorio 60 minutos antes, solo a inscriptos activos, una sola vez.
- Los tokens de dispositivo no se borran al suspender al usuario ni con `logout-all` (límite conocido).
- Notas de voz: AAC `.m4a`, hasta 60 s y 2 MB, sin cola offline.
- "Contactos" se resolvió como invitación por link `junte://plans/<id>`, sin página web detrás.
