# Plan de AWS

Plan de trabajo de la responsable de AWS: qué hay hecho, qué falta, en qué orden hacerlo, cuánto cuesta y cómo verificarlo.

**Estado (2026-10-25):** en la cuenta A están desplegados `junte-dev-network` (pasos 1.3 y 1.4), `junte-dev-base` (pasos 1.1 y 1.2) y `junte-dev-mongo` (paso 1.6: replica set `rs0` de 1 nodo, usuarios, secreto `junte/dev/mongo-app-uri`, 20 migraciones e índices). `egress`, `redis` y `back` se probaron (pasos 1.5, 1.7 y 1.8: el back lee los secretos con el SDK y su health da Mongo y Redis `up`) y se encienden y apagan por sesión. Evidencia en [docs/evidencia/](../evidencia/). Faltan el dominio (pedido por GitHub Education) para `dns` y `front` (paso 1.9). Los comandos de despliegue son `task aws:*` y `task back:release` (ver [Rutina de cada sesión](#rutina-de-cada-sesión)).

Escrito el 2026-10-12 a partir del informe de arquitectura (`docs/junte.pdf`), `CLAUDE.md`, `docs/` e `infra/`.

## Datos de partida

| Tema | Respuesta | Consecuencia |
|------|-----------|--------------|
| Cuenta | AWS Academy Learner Lab, **dos cuentas con 40 USD cada una**, las dos vacías | El crédito es un total, no mensual. Si se agota, la cuenta se desactiva y se pierde todo lo creado |
| Región | `us-east-1` | La más barata y una de las dos que permite el lab |
| Dominio | Ya hay uno, lo administra Paula | Se delega un subdominio a Route 53 una sola vez |
| Acceso | Solo Paula entra a AWS | El resto del equipo recibe URLs, nombres de variables y evidencia |

Uso propuesto de las dos cuentas:

- **Cuenta A, "dev":** construir y probar los templates, y las sesiones de prueba del equipo durante los sprints 1 a 6.
- **Cuenta B, "entrega":** se despliega recién cuando los templates ya funcionan en A. Se usa para la validación del sprint 7 y la demo.

Como todo queda en CloudFormation, pasar de A a B es correr los mismos comandos con otros parámetros.

**A confirmar:** si la cuenta B es el lab de otra persona, solo esa persona puede apretar "Start Lab". Hay que acordar cómo se opera (juntas, o esa persona corre los comandos).

## Lo que cambia por ser Learner Lab

El informe y `docs/` están escritos pensando en una cuenta común. En Learner Lab hay diferencias que conviene tener claras antes de empezar. Las marcadas **(comprobar)** son restricciones habituales del lab que no pude verificar en esta cuenta: el paso 0.3 las comprueba.

| Lo que pide el informe o la consigna | En Learner Lab |
|--------------------------------------|----------------|
| MFA en root, no usar root | No hay acceso a root. No aplica |
| Usuario IAM o SSO para trabajar | No se pueden crear usuarios ni grupos IAM. Se trabaja con las credenciales temporales del lab, que vencen al terminar cada sesión |
| Roles IAM de mínimo privilegio por capa | **Comprobado (0.3): no se pueden crear roles.** Todas las EC2 usan `LabRole` / `LabInstanceProfile`, que tiene permisos amplios. Es un desvío respecto del informe; ver [Roles IAM](#roles-iam-el-desvío-más-importante) |
| Alerta de AWS Budgets | **Comprobado (0.3): Budgets abre en esta cuenta**, así que la alerta del paso 0.2 se puede crear. El contador de crédito del lab y la rutina de apagado siguen siendo el control principal |
| Infraestructura encendida | Al terminar la sesión (4 horas) el lab **detiene las EC2** y las vuelve a arrancar en la sesión siguiente. **No apaga NAT, ALB, ElastiCache ni endpoints: siguen cobrando.** Por eso hay que borrar esos stacks al terminar cada sesión |
| Límites | **(comprobar)** Hasta 9 EC2 encendidas a la vez, tipos hasta `large`. La topología completa usa 7 |

## 1. Qué está definido en código y qué falta

### Ya existe

| Qué | Dónde |
|-----|-------|
| Entorno local completo (Nginx, back, MongoDB de 1 nodo, Redis) | `infra/docker-compose.dev.yml`, `infra/back/`, `infra/mongo/` |
| Configuración de Nginx lista para AWS, con tres variables por entorno (`NGINX_TRUSTED_CIDR`, `NGINX_RESOLVER`, `NGINX_BACKEND`) | `front-service/` |
| Imagen de producción del back (target `prod`, propuesta) | `back-service/Dockerfile` |
| Variables que exige el back, validadas al arrancar | `back-service/.env.example`, `back-service/src/config/` |
| Storage S3 con credenciales del rol de la instancia | `back-service/src/adapters/` |
| Migraciones (índices y validadores) | `back-service/migrations/` |
| Diseño de red, Security Groups, timeouts y secuencia de despliegue | `docs/arquitectura/02`, `09`, `10`, ADR-0003 y ADR-0005 |

### Lo de AWS

Hecho:

- `infra/templates/10-network.yml` con sus parámetros de `dev` y `entrega` (red y Security Groups; S1-INF-05 sin los NAT ni los endpoints de interfaz, y S1-INF-06 sin la prueba con instancias).
- `infra/templates/00-base.yml` con sus parámetros (S1-INF-07 sin Redis): buckets de fotos y de operación, ECR, grupos de logs y los secretos `junte/<env>/jwt-secret`, `mongo-admin`, `mongo-app`, `mongo-migrations`, `mongo-backup` y `mongo-keyfile`. Los roles por capa están escritos detrás de `CreateIamRoles`, en `false` en el lab. Quedan para más adelante `mongo-app-uri` (paso 1.6) y `fcm-service-account` (paso 5.1).
- `infra/templates/20-egress.yml`, `30-redis.yml` y `31-mongo.yml` con sus parámetros, **sin desplegar** (se prueban en la próxima sesión con el lab):
  - `20-egress`: 1 o 2 NAT (`NatCount`), rutas `0.0.0.0/0` de las 7 tablas privadas (datos c sale por el NAT de la zona a), endpoints de interfaz de SSM, Secrets Manager y Logs con su SG (`InterfaceEndpoints`). Sin exports, para poder borrarlo en cada sesión.
  - `30-redis`: ElastiCache `ReplicationGroup`, Redis 7.1, 1 nodo o primario y réplica con failover (`NodeCount`), sin TLS en tránsito ni `AuthToken` (límite documentado), cifrado en reposo. Exporta `junte-<env>-RedisUrl` para `40-back`.
  - `31-mongo`: 1 o 3 EC2 Amazon Linux 2023 con Docker y `mongo:9.0.2-noble`, IP privada fija (`10.0.30.10`, `10.0.31.10`, `10.0.32.10`), disco de datos gp3 cifrado con `DeletionPolicy: Snapshot`, IMDSv2 y la clave del replica set leída de Secrets Manager. `rs.initiate`, los usuarios y `mongo-app-uri` siguen siendo pasos a mano del 1.6.
- `cfn-lint` de `infra/templates/` en CI (job `infra`) y en `task ci` (`task infra:lint`, en Docker).
- `infra/templates/01-dns-cert.yml`, `40-back.yml` y `50-front.yml` con sus parámetros, **sin desplegar**:
  - `01-dns-cert`: zona de Route 53 del subdominio (`ZoneName`, a completar) y certificado ACM de `api.<zona>` validado por DNS. Dos pasadas: zona (`CreateCertificate=false`), delegación a mano con los 4 NS del output, y después el certificado. Queda siempre creado.
  - `40-back`: ALB interno (idle 300 s, sin stickiness, health `/internal/health`) y 1 o 2 EC2 con la imagen de ECR, logs `awslogs` e IMDSv2 con 2 saltos para que el contenedor use el rol. Pasa los nombres de los secretos, no los valores. Exporta el DNS del ALB interno.
  - `50-front`: ALB público solo 443 (TLS 1.2/1.3, sin access logs), 1 o 2 EC2 con `nginx:1.30.5-alpine` y los mismos montajes que en local (configuración desde `s3://<OpsBucket>/nginx/`) y el registro alias `api.<zona>`. Output `ApiUrl` para `mobile/eas.json`.

Tareas abiertas:

| Tarea | Qué es |
|-------|--------|
| S1-INF-05 | VPC, subredes, IGW, NAT por AZ, rutas, VPC endpoints |
| S1-INF-06 | Security Groups |
| S1-INF-07 | S3 privado, Secrets Manager, roles IAM, Redis |
| S1-INF-08 | MongoDB de 3 nodos con autenticación y migraciones |
| S1-INF-09 | ALB interno y back en 2 AZ |
| S1-INF-10 | Nginx en 2 AZ, ALB público con certificado, DNS |
| S6-INF-01 a 04 | CloudWatch, Session Manager, backups, restauración probada |
| S7-QA-02, 04 a 10 | Pruebas en AWS (concurrencia, aislamiento, disponibilidad, NAT, WebSocket, restauración, logs) |

### Decisiones que están esperando

Las tres primeras bloquean S1. Va la recomendación de cada una.

| Decisión | Recomendación | Por qué |
|----------|---------------|---------|
| **Redis** (ElastiCache o EC2) | ElastiCache, nodo `cache.t4g.micro`. Con réplica en la otra AZ en "entrega", un solo nodo en "dev" | Es la propuesta de `pendientes.md`. Sin TLS en tránsito, para que `REDIS_URL` siga siendo `redis://` (límite ya documentado). Si el lab no permite ElastiCache, plan B: Redis en Docker en una EC2 |
| **Cómo corre el back en EC2** | Contenedor Docker con el target `prod`, imagen en ECR. Nginx con la imagen oficial, igual que en local | El `Dockerfile` ya existe y los templates de Nginx dependen del entrypoint de la imagen oficial. Mismo artefacto en local y en AWS |
| **Cómo llegan los secretos** | ✅ **Decidido (2026-10-21): SDK al arrancar** (`resolveSecrets`), lo que dice el informe en 5.3. `40-back.yml` le pasa al contenedor solo los nombres de los secretos (`JWT_SECRET_ID`, `MONGO_URI_SECRET_ID`) | Necesita el cambio en el back (dependencia `@aws-sdk/client-secrets-manager`); hasta entonces el back no arranca en AWS. Se descartó el puente por script de arranque |
| **TLS interno** | Dejarlo como límite documentado | Ya está aceptado en `pendientes.md` |
| **VPC endpoints de interfaz** | Encendidos solo en "entrega" | Son el segundo rubro más caro. El informe los da como opcionales ("se podrán usar"). El de S3 es gratis y va siempre |

## 2. Cómo se organiza el código de infraestructura

Stacks separados según cuánto cuestan y cuánto viven. Los tres primeros quedan siempre creados; el resto se crea al empezar una sesión de trabajo y se borra al terminar.

| Orden | Template (a crear en `infra/templates/`) | Stack | Contiene | Costo apagado |
|-------|------------------------------------------|-------|----------|---------------|
| 1 | `00-base.yml` | `junte-<env>-base` | Buckets S3, repositorio ECR, grupos de logs con retención, secretos generados | Centavos |
| 2 | `01-dns-cert.yml` | `junte-<env>-dns` | Zona de Route 53 del subdominio, certificado ACM | 0,50 USD/mes |
| 3 | `10-network.yml` | `junte-<env>-network` | VPC, subredes, IGW, tablas de rutas, endpoint de S3, Security Groups | Gratis |
| 4 | `20-egress.yml` | `junte-<env>-egress` | NAT Gateway (1 o 2), sus rutas, endpoints de interfaz opcionales | **Cobra por hora: borrar** |
| 5 | `30-redis.yml` | `junte-<env>-redis` | ElastiCache | **Cobra por hora: borrar** |
| 6 | `31-mongo.yml` | `junte-<env>-mongo` | EC2 de MongoDB (1 o 3) y sus discos | Solo los discos (el lab detiene las EC2) |
| 7 | `40-back.yml` | `junte-<env>-back` | ALB interno, target group, EC2 del back | **Cobra por hora: borrar** |
| 8 | `50-front.yml` | `junte-<env>-front` | ALB público, listener 443, EC2 de Nginx, registro DNS | **Cobra por hora: borrar** |

Parámetros en `infra/parameters/<env>/<template>.json`, con `<env>` = `dev` o `entrega`. Llevan CIDR, tipos de instancia, cantidades y dominio. **Nunca** secretos ni IDs de cuenta; los valores entre stacks se pasan con `Outputs` / `ImportValue`.

Comando, igual para todos (PowerShell o bash):

```
aws cloudformation validate-template --template-body file://infra/templates/10-network.yml
aws cloudformation deploy --stack-name junte-dev-network --template-file infra/templates/10-network.yml --parameter-overrides file://infra/parameters/dev/10-network.json --tags project=junte env=dev --no-fail-on-empty-changeset
```

- Para ver qué va a cambiar sin aplicarlo: agregar `--no-execute-changeset`.
- Para borrar: `aws cloudformation delete-stack --stack-name junte-dev-front` y después `aws cloudformation wait stack-delete-complete --stack-name junte-dev-front`.
- Orden de encendido: `egress`, `redis` y `mongo`, `back`, `front`. Apagado: al revés.
- Encender todo lleva unos 15 a 20 minutos (ElastiCache es lo más lento). Contarlo dentro de las 4 horas de sesión.

## 3. Costos

Precios de lista de `us-east-1`, por demanda, usados como referencia. Confirmarlos en la calculadora de AWS antes de desplegar: pueden haber cambiado.

### Topología completa (la que exige el informe para la entrega)

| Recurso | Cantidad | USD por hora | USD por mes (730 h) |
|---------|----------|--------------|---------------------|
| **VPC endpoints de interfaz** (SSM ×3, Secrets Manager, Logs) | 5 servicios × 2 AZ | 0,100 | **73** |
| **NAT Gateway** | 2 | 0,090 | **66** |
| **EC2 MongoDB** `t3.small` | 3 | 0,062 | **46** |
| ALB (público e interno) | 2 | 0,045 | 33 |
| EC2 back `t3.small` | 2 | 0,042 | 30 |
| ElastiCache `cache.t4g.micro` | 2 | 0,032 | 23 |
| EC2 Nginx `t3.micro` | 2 | 0,021 | 15 |
| IPv4 públicas (2 NAT, 2 del ALB) | 4 | 0,020 | 15 |
| Discos EBS gp3 | unos 90 GB | fijo | 7 |
| Secretos, zona DNS, logs, S3 | | fijo | 3 |
| **Total** | | **0,41** | **unos 310** |

Lo más caro son los endpoints de interfaz, los NAT y MongoDB. Encendida todo el mes no entra en el crédito ni de cerca: **un día completo cuesta unos 10 USD**. Una sesión de 4 horas, 1,65 USD.

### Versión reducida para desarrollo ("dev")

| Cambio | Ahorro por hora |
|--------|-----------------|
| 1 NAT en vez de 2 (desvío temporal que ADR-0005 permite si queda escrito) | 0,050 |
| Sin endpoints de interfaz (solo el de S3, gratis) | 0,100 |
| MongoDB replica set de 1 nodo (igual que en local; mantiene transacciones) | 0,042 |
| 1 back y 1 Nginx (los dos ALB se mantienen) | 0,031 |
| Redis de 1 nodo | 0,016 |

Queda en **0,17 USD por hora: 0,70 USD por sesión de 4 horas**. Conserva la misma cadena (ALB público, Nginx, ALB interno, back, Redis, MongoDB), los mismos Security Groups y HTTPS, así que sirve para probar la app, las fotos, el chat y el push.

No sirve como evidencia de la entrega: las pruebas de disponibilidad, elección de primario y NAT por zona (S7-QA-06 y 07) necesitan la completa. Son los mismos templates con otros parámetros, así que no hay nada que reescribir.

### Lo que sigue cobrando si me olvido de apagar

El lab detiene las EC2, pero no el resto:

| Versión | Sigue cobrando | Por día olvidado |
|---------|----------------|------------------|
| Completa | NAT, ALB, Redis, endpoints, IP públicas | **6,90 USD** |
| Reducida | NAT, ALB, Redis, IP públicas | **2,90 USD** |

Dos fines de semana olvidados se llevan una cuenta entera.

### Presupuesto propuesto

| Cuenta | Uso | Estimado |
|--------|-----|----------|
| **A, dev** | Costos fijos de 6 semanas | 4 |
| | S1: armar y depurar los templates (3 sesiones reducidas, 2 completas) | 5,5 |
| | S2 a S5: 12 sesiones reducidas con el equipo | 8,5 |
| | S6: logs, backups y restauración (3 sesiones) | 3 |
| | **Total, con tope en 30 de 40** | **unos 21** |
| **B, entrega** | Costos fijos de 2 a 3 semanas, con discos de MongoDB | 3 |
| | S7: 5 sesiones completas de validación | 8,5 |
| | Ensayo y demo (3 sesiones completas) | 5 |
| | **Total, con tope en 30 de 40** | **unos 17** |

Con lo que sobra en B se puede dejar la topología completa encendida unos **2 días seguidos**, no más. ✅ **Docentes (2026-10-21):** no hace falta dejar el sistema encendido para la corrección; el crédito de B queda para las pruebas del sprint 7 y la demo.

## 4. Seguridad de la cuenta

### Antes de empezar

| En una cuenta común | En Learner Lab |
|---------------------|----------------|
| MFA en root y no usarlo nunca | No hay root. Lo que hay que proteger es el usuario de AWS Academy: contraseña única y el segundo factor si la institución lo ofrece |
| Usuario IAM o SSO con MFA | No se puede. Se usa el rol del lab |
| Credenciales locales del CLI | Las temporales del lab (ver abajo) |

Reglas para las credenciales locales:

1. Instalar AWS CLI v2 y el plugin de Session Manager.
2. En el lab, "AWS Details" y "AWS CLI: Show". Copiar las tres líneas a `C:\Users\<usuario>\.aws\credentials`, en un perfil con nombre: `[junte-dev]` para la cuenta A y `[junte-entrega]` para la B. Región en `~/.aws/config`: `us-east-1`.
3. Elegir el perfil en cada terminal: `$env:AWS_PROFILE = 'junte-dev'`. Con dos cuentas, mirar siempre cuál está activa antes de desplegar o borrar.
4. Comprobar: `aws sts get-caller-identity`. No pegar esa salida en el repo ni en el chat del equipo (muestra el ID de cuenta).
5. Vencen al terminar la sesión: hay que volver a copiarlas cada vez.
6. Nunca van en el repo, en `back-service/.env`, en `mobile/.env`, en EAS ni en GitHub Actions. El back no las necesita: usa el rol de la instancia.
7. No usar el par de claves SSH `vockey` que trae el lab. Las instancias se crean sin par de claves y sin puerto 22.

### Acceso del resto del equipo

No necesitan entrar a AWS y en el lab no hay forma de darles un acceso limitado: compartir las credenciales del lab es darles todos los permisos de `LabRole`. Lo que sí reciben:

| Quién | Qué recibe |
|-------|------------|
| Back | Nombres de las variables y de los secretos (nunca los valores), el formato de `MONGO_URI`, y logs filtrados por `requestId` cuando los pidan |
| App | La URL de la API de cada entorno y el calendario de sesiones en que AWS está encendido |
| Nginx | Los tres valores `NGINX_*` de AWS |
| Todos | La evidencia de cada verificación, en `docs/evidencia/` (S7-DOC-02) |

Si más adelante el proyecto pasa a una cuenta común: un usuario por persona con MFA, un grupo de solo lectura (`ReadOnlyAccess` más `CloudWatchLogsReadOnlyAccess`) y Session Manager solo para quien opere.

### Roles IAM: el desvío más importante

El informe pide roles de mínimo privilegio: el back lee solo sus secretos y escribe solo en sus prefijos de S3, y Nginx no llega a ninguno de los dos. En Learner Lab las siete EC2 comparten `LabRole`.

Propuesta para no perder el diseño:

- Los templates reciben el perfil de instancia como parámetro (`LabInstanceProfile` en el lab).
- Los tres roles de mínimo privilegio (front, back, datos) se escriben igual en el template, detrás de una condición `CreateIamRoles` que en el lab va en `false`. El diseño queda en código y se puede mostrar, aunque no se aplique.
- En la entrega se declara como **limitación conocida** (S7-DOC-03). En el lab, lo que separa las capas son los Security Groups y que Nginx no tiene ni el código ni las variables del back.

Política del rol del back, con todo lo que quedó anotado en `pendientes.md` (secciones D y F):

| Permiso | Sobre | Por qué |
|---------|-------|---------|
| `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` | `users/*` y **`plans/*`** del bucket de fotos | Fotos de perfil (S2) y de planes (S3). `DeleteObject` borra la foto anterior y las que no pasan la verificación |
| `s3:ListBucket` | El bucket de fotos | Sin esto, `HeadObject` de una clave que no existe da 403 en vez de 404 y el back responde 500 |
| `secretsmanager:GetSecretValue` | Solo los secretos del back | Mongo, JWT y FCM |
| `AmazonSSMManagedInstanceCore` | | Session Manager |
| Escritura de logs | Su grupo de logs | CloudWatch |

`docs/tareas/01-base-tecnica.md` dice que alcanza con `PutObject` y `GetObject`. Quedó viejo: vale la lista de arriba.

## 5. Checklist por sprint

Cada paso indica qué es, cómo se hace, qué hace falta antes, cómo se verifica y quién lo necesita. Salvo que diga "cuenta B", todo se hace primero en la cuenta A.

### Paso 0 · Antes de crear nada

**0.1 · Confirmar crédito y fechas**
- **Qué es:** saber cuánta plata hay y hasta cuándo existen las cuentas.
- **Cómo:** a mano, en la página del lab.
- **Verificación:** anotados, fuera del repo, el crédito de cada cuenta y la fecha de fin del curso. Al terminar el curso el lab borra todo: la evidencia tiene que estar exportada antes.
- **Lo necesita:** todo el plan de costos.

**0.2 · Alerta de presupuesto (AWS Budgets)**
- **Qué es:** un aviso por mail cuando el gasto pasa un umbral. No frena nada, solo avisa, y los datos llegan con horas de atraso.
- **Cómo:** consola, Billing, Budgets, "Create budget", tipo costo, 30 USD, avisos al 50 % y al 80 % del gasto real y al 100 % del proyectado. Por CLI es `aws budgets create-budget`.
- **Antes:** un mail donde recibir los avisos.
- **Verificación:** el presupuesto aparece en la lista y llega el mail de confirmación.
- ✅ **Hecho en la cuenta A** (2026-10-19): Budgets no está bloqueado (paso 0.3) y la alerta está configurada.
- **Si el lab lo bloquea** (acceso denegado): el control pasa a ser manual. Anotar el contador de crédito del lab al abrir y al cerrar cada sesión, y cumplir siempre la [rutina de cierre](#rutina-de-cada-sesión). El contador también se actualiza con atraso.
- **Depende de:** nada. Es el primer paso en las dos cuentas.

**0.3 · Comprobar los límites del lab**
- **Qué es:** probar, sin gastar, las restricciones que este plan da por ciertas.
- **Cómo:** a mano, en la consola. Leer el "Readme" del lab y probar: abrir Budgets; iniciar la creación de un rol en IAM; ver que ElastiCache, Route 53 (crear zona), ACM, ECR y Secrets Manager abren sin error; ver el límite de instancias EC2.
- **Verificación:** una lista de sí o no. Si algo difiere de la tabla de [Lo que cambia por ser Learner Lab](#lo-que-cambia-por-ser-learner-lab), se ajusta este plan antes de escribir templates.
- **Lo necesita:** los pasos 1.x.

**0.4 · Credenciales y herramientas locales**
- **Qué es:** dejar la terminal lista.
- **Cómo:** a mano, ver [Seguridad de la cuenta](#4-seguridad-de-la-cuenta).
- **Verificación:** `aws sts get-caller-identity` responde con cada perfil.

**0.5 · Cerrar las decisiones**
- **Qué es:** confirmar con el equipo las de [Decisiones que están esperando](#decisiones-que-están-esperando) y el subdominio a usar. ✅ Decidido (2026-10-21): `dev.<dominio>` en la cuenta A (perfil `preview` de la app) y `app.<dominio>` en la B (perfil `production`); la API queda en `api.dev.<dominio>` y `api.app.<dominio>`. Falta confirmar el dominio.
- **Verificación:** anotadas en `docs/pendientes.md` por quien esté editando ese archivo.
- **Lo necesita:** back (secretos y contenedor), app (dominio).

### Sprint 1 · Topología y `/health` por HTTPS

Objetivo del informe: topología multi-AZ, health checks de los dos ALB y acceso externo solo por HTTPS.

**1.1 · Base persistente** (S1-INF-07, parte)
- **Qué es:** lo que no cuesta casi nada y queda siempre. Un bucket de fotos privado; un bucket de operación (backups y la configuración de Nginx); un repositorio ECR para la imagen del back; grupos de logs con retención de 14 días.
- **Cómo:** CloudFormation, `00-base.yml`, stack `junte-<env>-base`.
- **Antes:** nombres de bucket únicos en todo AWS (prefijo `junte-<env>-` más un sufijo propio). Bucket de fotos: Block Public Access completo, cifrado por defecto, sin CORS (la app es nativa), y una regla que borre las subidas incompletas. Bucket de operación: vencimiento de `backups/` a los 14 días.
- **Verificación:** abrir la URL de un objeto sin firma da 403 (criterio "las fotografías permanecen privadas"). `aws s3api get-public-access-block` muestra los cuatro bloqueos en `true`.
- **Lo necesita:** back, para fotos (S2 y S3); la app, para probar la subida desde el teléfono.

**1.2 · Secretos** (S1-INF-07, parte)
- **Qué es:** el lugar donde viven las contraseñas, para que no estén en Git ni en las instancias.
- **Cómo:** en `00-base.yml`, con `GenerateSecretString`, así nadie ve ni tipea los valores: firma JWT (64 caracteres), contraseñas de los usuarios de MongoDB y la clave interna del replica set. La URI completa de MongoDB se arma en el paso 1.6. El de FCM se carga en S5.
- **Antes:** nombres acordados con back. Propuesta: `junte/<env>/jwt-secret`, `junte/<env>/mongo-app-uri`, `junte/<env>/mongo-admin`, `junte/<env>/fcm-service-account`.
- **Verificación:** `aws secretsmanager list-secrets` los muestra. Ningún valor aparece en templates, parámetros ni en la salida de CloudFormation.
- **Ojo:** el `JWT_SECRET` fijo que quedó en el historial de Git (commit `2f010fb`) no se usa nunca fuera de local. Con `GenerateSecretString` no hay riesgo de copiarlo.
- **Lo necesita:** back.

**1.3 · Red** (S1-INF-05, parte gratis)
- **Qué es:** la red privada donde vive todo. VPC `10.0.0.0/16`; subredes públicas en 2 zonas; privadas de borde en 2; de aplicación en 2; de datos en 3. Internet Gateway, una tabla de rutas por subred privada y el endpoint de S3 (gratis).
- **Cómo:** CloudFormation, `10-network.yml`.
- **Antes:** el CIDR. Si se cambia, avisar a quien mantiene Nginx: es el valor de `NGINX_TRUSTED_CIDR`.
- **Verificación:** 9 subredes en la consola; solo las 2 públicas tienen ruta al Internet Gateway; ninguna subred privada asigna IP pública.
- **Lo necesita:** todos los pasos siguientes.

**1.4 · Security Groups** (S1-INF-06)
- **Qué es:** el cortafuegos de cada capa. Cada una acepta solo a la anterior.
- **Cómo:** en `10-network.yml`, según la matriz de `docs/arquitectura/02-comunicacion-y-red.md`:

  | Grupo | Entra | Desde |
  |-------|-------|-------|
  | `sg-alb` | 443 | Internet |
  | `sg-front` | 8080 | `sg-alb` |
  | `sg-alb-interno` | 3000 | `sg-front` |
  | `sg-back` | 3000 | `sg-alb-interno` |
  | `sg-redis` | 6379 | `sg-back` |
  | `sg-db` | 27017 | `sg-back` y `sg-db` (replicación) |

  Salidas explícitas, no "todo permitido": cada grupo sale solo hacia el siguiente, más 443 para servicios de AWS, FCM e imágenes. Ningún grupo abre el 22. El `sg-alb` **no** abre el 80: el informe pide que 443 sea la única entrada.

  El grupo de los endpoints de interfaz (443 desde la VPC) no va acá: lo crea `20-egress.yml`, junto con los endpoints. El grupo `default` que AWS crea con la VPC no se usa en ningún recurso.
- **Verificación:** se completa en 1.8 y 1.9, con instancias. Es el criterio de aislamiento del informe (7.5).
- **Lo necesita:** todas las capas.

**1.5 · Salida a Internet** (S1-INF-05, parte paga)
- **Qué es:** los NAT Gateway, para que las instancias privadas bajen imágenes y el back llegue a FCM. Con el parámetro en 2, cada subred privada sale por el NAT de su zona (ADR-0005). La subred de datos de la tercera zona, que no tiene NAT propio, sale por el de otra zona o por los endpoints.
- **Cómo:** CloudFormation, `20-egress.yml`. Parámetros `NatCount` (1 en dev, 2 en entrega) e `InterfaceEndpoints` (`false` en dev, `true` en entrega).
- **Verificación:** desde una instancia privada, `curl -s https://checkip.amazonaws.com` devuelve la IP del NAT de su zona.
- **Stack de encender y apagar.**
- **Lo necesita:** back (FCM), todas las EC2 al instalarse.

**1.6 · MongoDB** (S1-INF-08)
- **Qué es:** la base. Tres nodos, uno por zona, que se replican; si cae el principal, otro toma su lugar. Las transacciones de cupos lo necesitan.
- **Cómo:** CloudFormation, `31-mongo.yml`, parámetro `NodeCount` (1 o 3). EC2 Amazon Linux 2023 con Docker y la imagen `mongo:9.0.2-noble`, la misma de local y de los tests. IP privada fija por nodo, disco de datos aparte, sin IP pública. La inicialización se hace **una vez a mano** por Session Manager: `rs.initiate`, usuario administrador, usuario de la app con `readWrite` solo sobre su base, usuario de migraciones con permiso de índices y validadores, usuario de backup. Autenticación activada y clave interna entre nodos.
- **Antes:** pasos 1.2 a 1.5. La URI que usa el back se guarda entera como secreto, con los tres nodos y `replicaSet=rs0`.
- **Después:** correr las migraciones (`npx migrate-mongo up`) y la carga de catálogos desde una instancia del back, con el usuario de migraciones.
- **Verificación** (criterios de la tarea y del informe): `rs.status()` muestra 3 miembros; al detener el primario, otro pasa a primario en segundos y la API sigue respondiendo; conectarse sin usuario falla; todos los índices de `docs/arquitectura/07-modelo-de-datos.md` existen.
- **Lo necesita:** back.

**1.7 · Redis** (S1-INF-07, parte)
- **Qué es:** el canal que reparte los mensajes del chat entre las instancias del back y guarda los locks de los jobs.
- **Cómo:** CloudFormation, `30-redis.yml`. ElastiCache `cache.t4g.micro` en las subredes de aplicación; un nodo en dev, primario y réplica con failover automático en entrega.
- **Verificación:** desde el back, `/internal/health` informa `redis: up`. Desde una instancia de Nginx, el puerto 6379 no responde.
- **Stack de encender y apagar.** No guarda nada que importe perder.
- **Lo necesita:** back (lo exige para arrancar; chat en S5, jobs en S4).

**1.8 · Back y ALB interno** (S1-INF-09)
- **Qué es:** las instancias de Express y el balanceador privado que reparte entre ellas.
- **Cómo:** construir la imagen en la PC (`docker build --target prod`) y subirla a ECR. Después CloudFormation, `40-back.yml`: 1 o 2 EC2 `t3.small` en las subredes de aplicación y un ALB interno. Target group en el puerto 3000 con health check `/internal/health`, **idle timeout de 300 s**, sin stickiness.
- **Antes:** la decisión de secretos (0.5). Variables del contenedor: `NODE_ENV=production`, `PORT`, `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL`, `JWT_SECRET`, `S3_BUCKET`, `AWS_REGION`, `LOG_LEVEL=info`. `FEED_WEIGHTS` es opcional, y si se define tiene que ser JSON válido o el back no arranca.
- **Detalles que rompen si se pasan por alto:**
  - La ruta del health check es exactamente `/internal/health`, sin barra final y en minúsculas. El back usa enrutado estricto y cualquier variante da 404.
  - Para que el contenedor obtenga las credenciales del rol: metadatos IMDSv2 con límite de saltos en 2, o el contenedor en modo de red `host`.
  - El back ya trae `keepAliveTimeout` de 305 s, mayor que el idle del ALB. No bajarlo.
- **Verificación:** los destinos figuran `healthy`. Desde Nginx, `curl http://<ALB interno>:3000/internal/health` da 200. El ALB interno no tiene IP pública.
- **Stack de encender y apagar.**
- **Lo necesita:** back, Nginx.

**1.9 · Nginx, ALB público y DNS** (S1-INF-10)
- **Qué es:** la entrada desde Internet. El ALB público recibe HTTPS y reenvía a Nginx.
- **Cómo:**
  1. `01-dns-cert.yml`, primera parte: crea la zona de Route 53 del subdominio.
  2. **A mano, una sola vez:** en el proveedor del dominio, cargar los 4 registros NS que muestra esa zona. Eso delega el subdominio.
  3. `01-dns-cert.yml`, segunda parte: certificado ACM validado por DNS. Se valida solo porque la zona ya está en Route 53.
  4. Subir la configuración de `front-service/` al bucket de operación.
  5. `50-front.yml`: 1 o 2 EC2 `t3.micro` con la imagen oficial `nginx:1.30.5-alpine` y los mismos montajes que en local. ALB público en las 2 subredes públicas, listener 443 con el certificado, target group en 8080 con health check `/health`, **idle timeout de 300 s**, sin stickiness. Registro `api.<subdominio>` apuntando al ALB.
- **Por qué delegar el subdominio:** el ALB se borra y se recrea en cada sesión y su nombre cambia. Con la zona en Route 53, CloudFormation actualiza el registro solo y no hay que tocar el proveedor cada vez.
- **Antes:** subdominio elegido. Valores de Nginx: `NGINX_TRUSTED_CIDR` = CIDR de la VPC, `NGINX_RESOLVER=169.254.169.253`, `NGINX_BACKEND=<DNS del ALB interno>:3000`.
- **Verificación** (criterio de la tarea y del informe):
  - `https://api.<subdominio>/health` da 200, y `https://api.<subdominio>/api/v1/health` da 200 con Mongo y Redis `up`.
  - Ninguna instancia tiene IP pública.
  - Desde Internet no responden 8080, 3000, 6379, 27017 ni 22.
  - `bash front-service/tests/smoke.sh https://api.<subdominio>` con `SMOKE_SKIP_LOCAL=1`.
  - Por Session Manager, desde una instancia de Nginx: los puertos de Redis y MongoDB no responden.
- **Stack de encender y apagar.**
- **Lo necesita:** la app (reemplazar los `*.invalid` de `mobile/eas.json`; hasta entonces no se pueden compilar los perfiles `preview` y `production`).

**1.10 · Session Manager, primera prueba** (adelanto de S6-INF-02)
- **Qué es:** entrar a las instancias sin SSH. Hace falta desde el primer día para inicializar MongoDB y diagnosticar.
- **Cómo:** no hay nada que crear: Amazon Linux 2023 trae el agente y `LabInstanceProfile` trae el permiso. Se entra con `aws ssm start-session --target <id de instancia>`.
- **Verificación:** `aws ssm describe-instance-information` lista todas las EC2.

### Sprint 2 · Auth, perfiles y fotos

**2.1 · Fotos de punta a punta**
- **Qué es:** probar la subida real de una foto de perfil. En local no se puede: sin bucket, el back usa un storage en memoria.
- **Cómo:** sin recursos nuevos. En una sesión con el entorno dev encendido, la app con perfil `preview` sube una foto.
- **Verificación** (criterio del informe): la foto se ve en el perfil; el objeto queda en `users/<userId>/`; su URL sin firma da 403; pedir la foto de una clave inexistente da 404 y no 500 (prueba el permiso `ListBucket`).
- **Lo necesitan:** back y app. Está anotado como "sin probar" en `pendientes.md`, sección D.

**2.2 · Medir Argon2 en la instancia**
- **Qué es:** el hash de contraseñas usa 19 MiB de memoria por login. Hay que ver que el `t3.small` lo aguante.
- **Cómo:** a mano: varios logins seguidos mirando tiempos y memoria.
- **Verificación:** el login responde en un tiempo razonable y la instancia no se queda sin memoria. Pasarle los números a back (`pendientes.md`, sección D).

### Sprint 3 · Planes y feed

**3.1 · Permisos sobre `plans/*`**
- **Qué es:** el back también sube y borra fotos de planes, con claves `plans/<planId>/…`.
- **Cómo:** en el lab no hay nada que cambiar: `LabRole` ya lo permite. En el rol de mínimo privilegio del template (el que queda apagado) se agrega `plans/*` junto a `users/*`, como en la [tabla del rol del back](#roles-iam-el-desvío-más-importante).
- **Verificación:** con el entorno dev encendido, `POST /uploads/presign` con `planId` y `PUT /plans/:id/photo` funcionan. La app todavía no sube fotos de plan, así que se prueba con `curl`.
- **Lo necesita:** back.

**3.2 · Clave de Google Maps** (no es AWS, pero quedó anotado para infra)
- **Qué es:** el mapa de "crear plan" en Android necesita una clave de Google Cloud.
- **Cómo:** a mano, en Google Cloud. Una clave de "Maps SDK for Android" por entorno, restringida al paquete de la app y a la huella SHA-1 de su certificado, con cuota y alerta de facturación. Se carga en EAS como `GOOGLE_MAPS_ANDROID_API_KEY`.
- **Antes:** **falta definir `android.package`** en `mobile/app.config.js`. Sin eso no se puede restringir la clave ni compilar con EAS. Es una decisión del equipo de la app.
- **Verificación:** el mapa carga en un development build.
- **Lo necesita:** app.

### Sprint 4 · Inscripciones y asistencia

Sin recursos nuevos. Una sola cosa para tener presente:

**4.1 · Jobs con lock en Redis**
- **Qué es:** el cierre automático de planes corre dentro del back y toma un lock en Redis para no ejecutarse dos veces.
- **Verificación:** en una sesión con la versión completa (2 instancias del back), el job corre una sola vez por ciclo. Se ve en los logs.
- **Lo necesita:** back (S4-BE-08).

### Sprint 5 · Chat y notificaciones

**5.1 · Secreto de FCM**
- **Qué es:** la credencial con la que el back envía notificaciones push.
- **Cómo:** a mano. Se crea la cuenta de servicio en Firebase y su JSON se carga en el secreto con `aws secretsmanager put-secret-value`, desde un archivo local que después se borra.
- **Antes:** el proyecto de Firebase, que lo crea el equipo de la app. El nombre de la variable se acuerda con back.
- **Verificación:** un push llega a un teléfono con development build. El back sale a FCM por el NAT.
- **Lo necesita:** back (S5-BE-07), app (S5-MOB-03).

**5.2 · WebSocket a través de los dos ALB** (S5-NG-01)
- **Qué es:** comprobar que el chat en tiempo real atraviesa ALB público, Nginx y ALB interno sin cortarse.
- **Cómo:** sin recursos nuevos. Confirmar que los dos ALB tienen idle timeout de 300 s y que ningún target group tiene stickiness.
- **Verificación** (criterio de la tarea): una conexión ociosa durante 5 minutos sigue viva en AWS. En la versión completa, dos usuarios conectados a instancias distintas del back se ven los mensajes (prueba Redis).
- **Lo necesitan:** back y app.

**5.3 · Notas de voz en S3**
- **Qué es:** la propuesta de `pendientes.md` es guardar el audio en S3 por el mismo flujo que las fotos.
- **Antes:** que back defina el prefijo de las claves. Si es uno nuevo, se suma al rol de mínimo privilegio igual que `plans/*`.
- **Lo necesita:** back.

### Sprint 6 · Observabilidad y backups

**6.1 · Logs en CloudWatch** (S6-INF-01)
- **Qué es:** que los logs de Nginx y del back queden centralizados y se puedan buscar por `requestId`.
- **Cómo:** los grupos ya existen desde el paso 1.1, con retención de 14 días. Cada contenedor envía su salida con el driver de logs `awslogs` de Docker. El agente de CloudWatch es opcional, para métricas de memoria y disco.
- **Antes:** confirmar con quien mantiene Nginx que el access log sale por la salida estándar del contenedor.
- **Dos riesgos de datos sensibles:**
  - **No activar los access logs de los ALB.** Guardan la URL completa, y `GET /plans?near=` lleva coordenadas en la query.
  - El error log de Nginx incluye la línea completa del request, también con coordenadas (`pendientes.md`, sección C). O no se envía a CloudWatch, o se sube su nivel a `crit`. Lo decide quien mantiene Nginx.
- **Verificación:** se toma el `requestId` de una respuesta y se lo encuentra en los logs de Nginx y del back. Buscar `password`, `Bearer`, `refreshToken`, `birthDate` y `latitude` no devuelve nada (criterio del informe y S7-QA-10).
- **Lo necesitan:** back (S6-BE-05) y todo el equipo para diagnosticar.

**6.2 · Session Manager en todas las EC2** (S6-INF-02)
- **Cómo:** ya está desde el paso 1.10. Acá se deja la evidencia.
- **Verificación:** las 7 instancias aparecen en `describe-instance-information`; ninguna tiene par de claves ni el puerto 22 abierto.

**6.3 · Backups de MongoDB** (S6-INF-03)
- **Qué es:** una copia periódica de la base en S3.
- **Cómo:** un temporizador de systemd en un nodo secundario corre `mongodump` con el usuario de backup, comprime y sube a `backups/` del bucket de operación. La regla de vencimiento de 14 días ya existe. Va en el arranque de `31-mongo.yml`.
- **Ojo en el lab:** las instancias están detenidas fuera de las sesiones, así que un horario nocturno no corre nunca. Programarlo "al arrancar y cada hora", o lanzarlo a mano al cerrar cada sesión.
- **Verificación:** hay un archivo nuevo en `backups/` con tamaño razonable.

**6.4 · Restauración probada** (S6-INF-04)
- **Qué es:** demostrar que el backup sirve. Un backup que nunca se restauró no cuenta.
- **Cómo:** a mano. Levantar una EC2 temporal con MongoDB, separada del replica set; bajar el último backup, `mongorestore`, comparar la cantidad de documentos por colección y borrar la instancia.
- **Verificación** (criterio del informe: "es posible restaurar MongoDB"): conteos iguales a los de origen. Guardar los comandos, la salida y el tiempo que llevó.
- **Depende de:** 6.3. **Lo necesita:** S7-QA-09.

### Sprint 7 · Validación y entrega (cuenta B)

**7.1 · Desplegar "entrega" en la cuenta B**
- **Qué es:** repetir los pasos 0.2 a 0.4 y 1.1 a 1.10 con los parámetros de `infra/parameters/entrega/`: 2 NAT, endpoints de interfaz, 3 nodos de MongoDB, 2 back, 2 Nginx, Redis con réplica.
- **Antes:** el segundo subdominio delegado; el secreto de FCM cargado también en B; una clave de Google Maps para el perfil de entrega.
- **Verificación:** las mismas de los pasos 1.6 a 1.9.
- **Lo necesita:** la app, para generar el APK con las URLs de producción (S7-MOB-01).

**7.2 · Pruebas del sprint 7 que tocan infraestructura**

| Prueba | Cómo se hace | Resultado esperado |
|--------|--------------|--------------------|
| S7-QA-04 Aislamiento | Desde Internet, probar 8080, 3000, 6379, 27017 y 22. Por Session Manager, desde cada capa, probar los puertos de las capas que no le corresponden | Solo responde 443. Cada salto alcanza solo al siguiente |
| S7-QA-06 Disponibilidad | Detener, de a una, una instancia de Nginx, una del back y el primario de MongoDB | La API sigue respondiendo. MongoDB elige otro primario |
| S7-QA-07 NAT por zona | Quitar la ruta por defecto de la subred de aplicación de una zona | El back de la otra zona sigue enviando push |
| S7-QA-08 WebSocket ocioso | Dejar una conexión 5 minutos sin tráfico | Sigue conectada |
| S7-QA-02 Concurrencia | El script del equipo de back contra el ALB público | El cupo nunca se supera |
| S7-QA-05 Rate limit por IP real | Dos clientes con IP distinta | El limitado recibe 429 con `requestId`; el otro no se ve afectado |
| S7-QA-09 Restauración | Repetir 6.4 en B, midiendo tiempos | Conteos iguales |
| S7-QA-10 Logs | Las búsquedas de 6.1 | Sin resultados |

Después de cada prueba que rompe algo, **volver a dejarlo como estaba** (rearrancar la instancia, restaurar la ruta) antes de la siguiente.

**7.3 · Evidencia y cierre**
- Guardar capturas y salidas de cada verificación en `docs/evidencia/` (S7-DOC-02), sin IDs de cuenta ni valores de secretos.
- Limitaciones a declarar (S7-DOC-03): tramos internos sin TLS; `LabRole` compartido en lugar de roles por capa; la infraestructura no queda encendida de forma permanente por el crédito disponible.
- Antes de que termine el curso: exportar la evidencia y un último backup. El lab borra todo.

## Rutina de cada sesión

**Al empezar**

1. Start Lab, copiar las credenciales al perfil, confirmar cuál es la cuenta activa.
2. Anotar el crédito usado.
3. `task aws:up ENV=dev`: muestra la cuenta activa, comprueba que existan los stacks permanentes (`network`, `base`, `dns` con certificado, `mongo`) y la imagen del back en ECR, pide confirmación y despliega en orden `egress`, `redis`, `back`, sube la configuración de Nginx a S3 y despliega `front`. Al final consulta el health.
4. Avisar al equipo que está encendido, con la URL que muestra.

Si hay una versión nueva del back: `task back:release ENV=dev` (construye la imagen para `linux/amd64`, la sube a ECR con el commit como tag y `latest`, y actualiza las instancias de a una sacándolas del balanceador). Los stacks permanentes y la primera vez de cada stack: `task aws:deploy ENV=dev STACK=<stack> PARAMS="Clave=Valor ..."`, que muestra el change set y pide confirmación. `task aws:status ENV=dev` dice qué hay encendido.

**Al terminar, siempre**

1. Lanzar un backup si hay datos que conservar.
2. `task aws:down ENV=dev`: borra en orden `front`, `back`, `redis` y `egress` (nunca los permanentes) y verifica que no queden NAT Gateways, balanceadores, Redis, IP elásticas ni endpoints de interfaz. Si queda algo, termina con error.
3. Si hubo error, revisarlo en la consola antes de cerrar.
4. Anotar el crédito usado.

Si no se llega a borrar antes de que venza la sesión, hay que abrir otra para hacerlo. No dejarlo para el día siguiente.

## Para avisar al equipo

Cosas que aparecieron al armar este plan y que resuelven otras personas:

- ✅ **Back · Redis y el health check** (resuelto el 2026-10-19). `/internal/health` respondía 503 si Redis no contestaba, y el ALB interno habría sacado a todas las instancias. Ahora el 503 depende solo de MongoDB y Redis caído es 200 con `status: 'degraded'` ([06-api.md](../arquitectura/06-api.md#salud)). En AWS, una caída de Redis no se ve en los destinos del ALB: hay que mirar el cuerpo del health o una alarma de ElastiCache (S6).
- ✅ **Back · secretos.** Decidido e implementado el SDK (2026-10-21): `JWT_SECRET_ID` y `MONGO_URI_SECRET_ID`, ver [pendientes](../pendientes.md). Falta probarlo en AWS (paso 1.8).
- **Back · `trust proxy`.** Si el back usa `req.ip`, configurarlo acorde a la cadena ALB, Nginx, ALB.
- **Back · migraciones.** Se corren a mano antes de cada versión, con un usuario distinto al de la app.
- **Nginx · logs.** Salida estándar del contenedor y qué hacer con el error log (paso 6.1).
- **App · dominios.** Reemplazar los `*.invalid` de `mobile/eas.json` cuando exista el subdominio. HTTP sin cifrar solo funciona en el build de desarrollo.
- **App · `android.package`** y el proyecto de Firebase: bloquean la clave de Google Maps y el push.
- **Docs.** `docs/tareas/01-base-tecnica.md` lista permisos de S3 incompletos; valen los de `pendientes.md`. Y `pendientes.md` puede marcar como resueltas las decisiones de Redis, contenedor y secretos cuando se confirmen.
- ✅ **Docentes.** No hace falta dejar el sistema encendido para la corrección (2026-10-21).
