# 10 · Despliegue

## Entornos

| Entorno | Dónde | Para qué |
|---------|-------|----------|
| **local** | docker-compose (`infra/docker-compose.dev.yml`): Nginx, back, MongoDB replica set de 1 nodo, Redis | Desarrollo diario y tests de integración |
| **aws** | Topología multi-AZ de abajo | Demo y entrega |

Mismo código en ambos: lo que cambia es la configuración (variables de entorno / Secrets Manager).

## Topología en AWS

| Subred | Zonas | Contiene | Ruta de salida |
|--------|-------|----------|----------------|
| Pública | a, b | ALB público, NAT Gateway (uno por zona) | Internet Gateway |
| Privada de borde | a, b | EC2 Nginx | NAT de **su misma zona** |
| Privada de aplicación | a, b | ALB interno, EC2 Express, Redis | NAT de su misma zona + VPC endpoints |
| Privada de datos | a, b, c | MongoDB (un nodo por zona) | Sin salida a Internet (solo lo necesario para actualizaciones, vía NAT si hace falta) |

- **NAT por zona** ([ADR-0005](adr/0005-nat-por-zona.md)): un solo NAT sería punto único de falla para FCM.
- VPC endpoints: S3 (gateway), Secrets Manager, CloudWatch Logs, SSM (para Session Manager sin NAT).
- **Idle timeout = 300 s** en el ALB público y en el ALB interno.
- Sin stickiness en los target groups (Socket.io solo WebSocket).
- Ninguna instancia con IP pública. Sin puerto 22.

## Secuencia de implementación

1. VPC, subredes (borde y aplicación en 2 AZ, datos en 3), Internet Gateway, **NAT Gateway por AZ**, tablas de rutas, Security Groups (cadena de [02](02-comunicacion-y-red.md#matriz-de-security-groups)).
2. Bucket S3 privado (Block Public Access), secretos (Mongo, JWT, FCM), Redis privado, roles IAM con mínimo privilegio.
3. MongoDB: 3 nodos, autenticación, `bindIp` privado, `replSetInitiate`, usuario de la app. **Correr migraciones** (crean índices y validadores). Verificar elección de primario y una restauración de backup.
4. Back service en 2 AZ; ALB interno con target group :3000, health check `/internal/health`, **idle timeout 300 s**.
5. Nginx en 2 AZ; proxy REST/WebSocket al ALB interno (resolver de la VPC), `set_real_ip_from` con el CIDR de la VPC, rate limiting, `/health`, `/admin`. Verificar que no llega a Redis ni MongoDB.
6. ALB público en 2 subredes públicas, listener 443 con certificado ACM, target group :8080, **idle timeout 300 s**. DNS.
7. CloudWatch (agente + retención limitada) y Session Manager (agente, rol, conectividad).
8. URLs por perfil de EAS, development build, pruebas funcionales y de aislamiento desde el teléfono.

## Despliegue de una versión del back service

1. CI verde en `main` (lint, tests, migraciones contra Mongo en memoria).
2. **Migraciones primero** (`migrate-mongo up`) — deben ser compatibles con la versión anterior del código que sigue corriendo (ver [migraciones.md](../practicas/migraciones.md#cambios-compatibles)).
3. Despliegue instancia por instancia: sacar del target group (draining), actualizar, health check OK, reingresar. Nunca las dos zonas a la vez.
4. Smoke test (`/health`, login, `GET /plans`).
5. Si falla: volver a la versión anterior del código. Las migraciones **no** se revierten automáticamente; `down` solo con decisión explícita.

## Respaldo y restauración

- Backup periódico (`mongodump` desde un secundario, o snapshots EBS) a S3 con retención limitada.
- **Una restauración probada** en un entorno separado antes del sprint 7. Un backup que nunca se restauró no cuenta.

## Cliente móvil

EAS Build con perfiles `development`, `preview`, `production` y URLs por entorno. Entrega académica: **APK de Android** (`buildType: 'apk'` en el perfil de entrega). Push probado en development build.
