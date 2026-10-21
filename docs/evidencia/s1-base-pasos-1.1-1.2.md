# Evidencia · Base persistente (pasos 1.1 y 1.2)

- **Fecha:** 2026-10-19, 16:09 (UTC−3)
- **Cuenta:** A, "dev" (AWS Academy Learner Lab), región `us-east-1`
- **Stack:** `junte-dev-base`, template [`infra/templates/00-base.yml`](../../infra/templates/00-base.yml), parámetros [`infra/parameters/dev/00-base.json`](../../infra/parameters/dev/00-base.json) (`CreateIamRoles=false`)
- **Tareas:** S1-INF-07 (parte: S3, ECR, logs, secretos; Redis va en `30-redis.yml`)
- **Plan:** [docs/infra/plan-aws.md](../infra/plan-aws.md), pasos 1.1 y 1.2

Los ID de cuenta se reemplazaron por `<cuenta>` y las firmas de las URL por `<omitido>`. Ningún valor de secreto se leyó ni aparece acá.

## Resumen

| Criterio | Resultado |
|----------|-----------|
| Abrir la URL de un objeto sin firma da 403 ("las fotografías permanecen privadas") | ✅ 403 en los dos estilos de URL; la misma URL firmada da 200 |
| `get-public-access-block` con los cuatro bloqueos en `true` | ✅ en los dos buckets |
| Cifrado por defecto, sin ACL, sin CORS, solo HTTPS | ✅ SSE-S3, `BucketOwnerEnforced`, sin CORS; una URL firmada por HTTP da 403 |
| Subidas multipart incompletas se borran (fotos) / `backups/` vence a los 14 días (operación) | ✅ |
| ECR con escaneo al subir | ✅ `scanOnPush: true`, conserva las últimas 5 imágenes |
| Grupos de logs con retención de 14 días | ✅ `/junte/dev/back` y `/junte/dev/nginx` |
| `list-secrets` muestra los secretos; ningún valor en templates, parámetros ni outputs | ✅ 6 secretos; los outputs solo tienen ARN y nombres |
| Roles IAM | No se crean en el lab (`CreateIamRoles=false`, 0 recursos IAM); limitación declarada |

## 1. Bucket privado: URL sin firma

Se subió un objeto de prueba, se pidió sin firma, firmado y firmado por HTTP, y se borró.

```
### put-object s3://junte-dev-photos-95xbnn/evidencia/prueba-403.txt
AES256
### GET sin firma: https://junte-dev-photos-95xbnn.s3.us-east-1.amazonaws.com/evidencia/prueba-403.txt
HTTP 403
### GET sin firma, estilo ruta
HTTP 403
### GET con URL firmada (vence en 60 s)
prueba junte
 | HTTP 200
### GET con URL firmada pero por HTTP sin cifrar
HTTP 403
### delete-object
borrado
### objetos que quedan en el bucket
0 (aws s3 ls --recursive no lista nada)
```

Comandos: `aws s3api put-object`, `curl -s -o /dev/null -w '%{http_code}'`, `aws s3 presign --expires-in 60`, `aws s3api delete-object`.

## 2. Configuración de los buckets

`aws s3api get-public-access-block`, `get-bucket-encryption`, `get-bucket-ownership-controls`, `get-bucket-cors`, `get-bucket-lifecycle-configuration` y `get-bucket-policy`. Iguales en los dos buckets salvo el ciclo de vida.

```
### get-public-access-block junte-dev-photos-95xbnn   (idéntico en junte-dev-ops-95xbnn)
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
### get-bucket-encryption                SSEAlgorithm: AES256          (los dos)
### get-bucket-ownership-controls        ObjectOwnership: BucketOwnerEnforced   (los dos)
### get-bucket-cors                      NoSuchCORSConfiguration       (los dos)
### get-bucket-policy (Sid y condición)  DenyInsecureTransport Deny {"Bool": {"aws:SecureTransport": "false"}}   (los dos)

### get-bucket-lifecycle-configuration junte-dev-photos-95xbnn
[ { "ID": "abort-incomplete-uploads", "Filter": { "Prefix": "" }, "Status": "Enabled",
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } } ]

### get-bucket-lifecycle-configuration junte-dev-ops-95xbnn
[ { "ID": "expire-backups", "Filter": { "Prefix": "backups/" }, "Status": "Enabled",
    "Expiration": { "Days": 14 } },
  { "ID": "abort-incomplete-uploads", "Filter": { "Prefix": "" }, "Status": "Enabled",
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } } ]
```

## 3. ECR y logs

```
### aws ecr describe-repositories --repository-names junte-dev-back
{ "nombre": "junte-dev-back", "scanOnPush": true, "tags": "MUTABLE", "cifrado": "AES256" }
### aws ecr get-lifecycle-policy (regla)
imageCountMoreThan 5 expire
### aws logs describe-log-groups --log-group-name-prefix /junte/dev/   (nombre, días de retención)
/junte/dev/back     14
/junte/dev/nginx    14
```

## 4. Secretos

`aws secretsmanager list-secrets` (nombre, tag `layer`, rotación). No se ejecutó `get-secret-value`.

```
junte/dev/jwt-secret         aplicacion  False
junte/dev/mongo-admin        datos       False
junte/dev/mongo-app          datos       False
junte/dev/mongo-backup       datos       False
junte/dev/mongo-keyfile      datos       False
junte/dev/mongo-migrations   datos       False
```

Outputs del stack (`aws cloudformation describe-stacks`): solo nombres y ARN, ningún valor.

```
PhotosBucket              junte-dev-photos-95xbnn
OpsBucket                 junte-dev-ops-95xbnn
BackRepositoryUri         <cuenta>.dkr.ecr.us-east-1.amazonaws.com/junte-dev-back
BackLogGroup              /junte/dev/back
NginxLogGroup             /junte/dev/nginx
JwtSecretArn              arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/jwt-secret-MOOdfW
MongoAdminSecretArn       arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/mongo-admin-uQsbOY
MongoAppSecretArn         arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/mongo-app-cwiqyO
MongoMigrationsSecretArn  arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/mongo-migrations-VvQLkN
MongoBackupSecretArn      arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/mongo-backup-fsd9if
MongoKeyFileSecretArn     arn:aws:secretsmanager:us-east-1:<cuenta>:secret:junte/dev/mongo-keyfile-mQJQet
FrontInstanceProfile      LabInstanceProfile
BackInstanceProfile       LabInstanceProfile
DataInstanceProfile       LabInstanceProfile
```

## 5. Roles IAM

`aws cloudformation list-stack-resources`: 0 recursos `AWS::IAM::*`. En Learner Lab no se pueden crear roles (paso 0.3), así que los tres roles de mínimo privilegio (front, back, datos) están escritos en el template detrás de `CreateIamRoles` pero no se aplicaron ni se probaron; las EC2 usarán `LabInstanceProfile`. Se declara como limitación conocida (S7-DOC-03).
