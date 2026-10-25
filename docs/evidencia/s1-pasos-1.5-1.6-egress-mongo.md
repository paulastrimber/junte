# Evidencia · Salida a Internet y MongoDB (pasos 1.5 y 1.6)

- **Fecha:** 2026-10-25, 11:40 a 12:02 (UTC−3)
- **Cuenta:** A, "dev" (AWS Academy Learner Lab), región `us-east-1`
- **Stacks:** `junte-dev-egress` ([`20-egress.yml`](../../infra/templates/20-egress.yml), 1 NAT) y `junte-dev-mongo` ([`31-mongo.yml`](../../infra/templates/31-mongo.yml), 1 nodo), desplegados con `task aws:deploy ENV=dev STACK=<stack>` (change set revisado antes de aplicarlo)
- **Tareas:** S1-INF-05 (NAT) y S1-INF-08 (MongoDB)
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md), pasos 1.5, 1.6 y 1.10

Los comandos dentro del nodo se ejecutaron con Session Manager (`aws ssm send-command`), sin SSH. Los scripts leen los secretos dentro de la instancia: ningún valor pasó por la pantalla ni por el texto de los comandos. Sin ID de cuenta.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| Desde una instancia privada, `curl https://checkip.amazonaws.com` devuelve la IP del NAT de su zona (1.5) | ✅ `52.2.148.16`, la IP elástica de `NatGatewayA` |
| El nodo no tiene IP pública ni par de claves; se administra por Session Manager (1.6, 1.10) | ✅ `PublicIpAddress: null`, `KeyName: null`, IMDSv2 obligatorio; Session Manager `Online` a los 40 s |
| Disco de datos aparte, cifrado | ✅ `/dev/sdf` gp3 20 GB cifrado, montado en `/data` (xfs); sistema `/dev/xvda` gp3 10 GB cifrado |
| `rs.status()` muestra los miembros (1.6; en entrega, 3) | ✅ `rs0`, 1 miembro, `10.0.30.10:27017` `PRIMARY` |
| Conectarse sin usuario falla (1.6) | ✅ `Command listDatabases requires authentication` |
| Usuario de la app con `readWrite` solo sobre su base | ✅ escribe en `junte`; `Unauthorized` en otra base y en los usuarios de `admin` |
| Transacciones (regla 3, cupos) | ✅ commit guarda 2 documentos; abort no guarda ninguno |
| URI del back guardada como secreto (`junte/dev/mongo-app-uri`) | ✅ conecta como `junte_app@junte` |
| Apagar el primario y que otro tome su lugar | ⏳ Necesita 3 nodos: cuenta B (S7-QA-06) |
| Índices de `07-modelo-de-datos.md` | ⏳ Las migraciones se corren desde una instancia del back (paso 1.8) |

## 1. Despliegue

```
$ task aws:deploy ENV=dev STACK=egress
Cuenta activa: perfil junte-dev · rol voclabs/<usuario> · región us-east-1 · entorno dev
==> junte-dev-egress (20-egress.yml)
|  Add   |  AppDefaultRouteA   |  None      |  AWS::EC2::Route       |
|  Add   |  AppDefaultRouteB   |  None      |  AWS::EC2::Route       |
|  Add   |  DataDefaultRouteA  |  None      |  AWS::EC2::Route       |
|  Add   |  DataDefaultRouteB  |  None      |  AWS::EC2::Route       |
|  Add   |  DataDefaultRouteC  |  None      |  AWS::EC2::Route       |
|  Add   |  EdgeDefaultRouteA  |  None      |  AWS::EC2::Route       |
|  Add   |  EdgeDefaultRouteB  |  None      |  AWS::EC2::Route       |
|  Add   |  NatEipA            |  None      |  AWS::EC2::EIP         |
|  Add   |  NatGatewayA        |  None      |  AWS::EC2::NatGateway  |
junte-dev-egress: CREATE_COMPLETE        (2 min)
Output NatPublicIpA: 52.2.148.16

$ task aws:deploy ENV=dev STACK=mongo
==> junte-dev-mongo (31-mongo.yml)
|  Add   |  DataVolumeA  |  None      |  AWS::EC2::Volume    |
|  Add   |  NodeA        |  None      |  AWS::EC2::Instance  |
junte-dev-mongo: CREATE_COMPLETE         (1 min)
Outputs: MongoHosts 10.0.30.10:27017 · NodeAInstanceId i-0f9376c7e24cbbdbd
```

## 2. Arranque del nodo (por Session Manager)

```
== cloud-init: status: done
== /data montado: /dev/nvme1n1 xfs
== keyfile: 400 999:999 65 bytes          (permisos, dueño mongod y tamaño; el contenido no se leyó)
== salida a Internet (IP vista desde afuera): 52.2.148.16
== contenedor: mongo mongo:9.0.2-noble Up
== mongod (ping local): 1
reinicios del contenedor: 0
```

`aws ec2 describe-instances` y `describe-volumes`:

```
tipo t3.small · zona us-east-1a · ip_privada 10.0.30.10 · ip_publica null · par_de_claves null · imdsv2 required
/dev/sdf   20 GB  gp3  cifrado
/dev/xvda  10 GB  gp3  cifrado
```

## 3. Inicialización (una vez, a mano)

Con la excepción de localhost (sin usuarios todavía se puede iniciar el replica set y crear el primero desde el mismo nodo); después, autenticado como admin, el resto.

```
replica set: rs.initiate ok
primario: true
usuario junte_admin: creado (root)
usuario junte_app: creado en junte (readWrite@junte)
usuario junte_migrations: creado en junte (readWrite@junte, dbAdmin@junte)
usuario junte_backup: creado en admin (backup@admin)
```

Contraseñas: las de los secretos `junte/dev/mongo-*` que generó `00-base.yml`.

## 4. Verificación

```
== 1. rs.status() (como admin)
set=rs0 miembros=1 -> 10.0.30.10:27017 PRIMARY health=1
== 2. sin usuario: listar bases
MongoServerError: Command listDatabases requires authentication
== 3 y 4. junte_app
escribe y borra en junte: ok
escribe en otra base: Unauthorized
lee usuarios de admin: Unauthorized
transacción con commit: 2 documentos
transacción con abort: 0 documentos
colección de prueba borrada
```

## 5. Secreto `mongo-app-uri`

Creado dentro del nodo a partir de `junte/dev/mongo-app` (misma contraseña de `junte_app`), con los tags `project`, `env`, `Name` y `layer: datos`. Formato:

```
mongodb://junte_app:<contraseña>@10.0.30.10:27017/junte?replicaSet=rs0&authSource=junte
```

Prueba con la URI guardada:

```
usuarios autenticados: [{"user":"junte_app","db":"junte"}]
base por defecto: junte
documentos en junte.verificacion (exige auth): 0
```

`aws secretsmanager list-secrets`: `jwt-secret`, `mongo-admin`, `mongo-app`, `mongo-app-uri`, `mongo-backup`, `mongo-keyfile`, `mongo-migrations` (bajo `junte/dev/`).

Limitación: la contraseña de `junte_app` queda en dos secretos (`mongo-app` y `mongo-app-uri`). Sin rotación automática (fuera de alcance), rotarla implica actualizar los dos y el usuario en MongoDB.
