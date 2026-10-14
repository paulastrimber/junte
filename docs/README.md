# Documentación de junte

Punto de entrada. Cada tema vive en **un solo archivo**: si hay que cambiar algo, se cambia ahí y se enlaza desde los demás.

## Empezar

1. [Vista general](arquitectura/01-vista-general.md) — las seis capas, el flujo de una request, el repo.
2. [Flujo de trabajo](flujo/flujo-de-trabajo.md) — de una tarea al merge.
3. [Backlog](tareas/README.md) — qué hay que hacer en cada sprint.
4. [Pendientes](pendientes.md) — lo que falta decidir antes de programar.

## Arquitectura

| Doc | Qué responde |
|-----|--------------|
| [01 · Vista general](arquitectura/01-vista-general.md) | ¿Qué piezas hay y qué hace cada una? |
| [02 · Comunicación y red](arquitectura/02-comunicacion-y-red.md) | Puertos, Security Groups, IP real, timeouts, NAT |
| [03 · Back service](arquitectura/03-back-service.md) | MVC + servicios, módulos, reglas de dependencia, DI |
| [04 · Front service](arquitectura/04-front-service.md) | Nginx: proxy, rate limit, requestId, `/admin` |
| [05 · App móvil](arquitectura/05-mobile.md) | Screens/hooks/services, tokens, offline, push |
| [06 · API](arquitectura/06-api.md) | Contrato: convenciones, endpoints, errores |
| [07 · Modelo de datos](arquitectura/07-modelo-de-datos.md) | Colecciones, índices, invariantes, transacciones |
| [08 · Tiempo real y push](arquitectura/08-tiempo-real-y-push.md) | Socket.io, eventos, FCM, jobs |
| [09 · Seguridad](arquitectura/09-seguridad.md) | JWT, permisos, validación, QR, S3, secretos |
| [10 · Despliegue](arquitectura/10-despliegue.md) | Entornos, AWS, secuencia, backups |
| [ADRs](arquitectura/adr/README.md) | Por qué se decidió cada cosa importante |

## Buenas prácticas

| Doc | Qué responde |
|-----|--------------|
| [SOLID y modularidad](practicas/solid-y-modularidad.md) | Cómo aplicar cada principio en junte, con ejemplos |
| [Estilo de código](practicas/estilo-de-codigo.md) | ESM, nombres, funciones, React Native |
| [Testing](practicas/testing.md) | Pirámide, casos obligatorios, convenciones |
| [Migraciones](practicas/migraciones.md) | Versionado de la base con migrate-mongo |
| [Errores y logs](practicas/errores-y-logs.md) | Catálogo de códigos, qué se loguea y qué no |
| [Pruebas en local](practicas/pruebas-en-local.md) | Entorno con Docker, pruebas de aceptación, app en el simulador de iOS o el teléfono, puertos ocupados |

## Flujo

- [Flujo de trabajo](flujo/flujo-de-trabajo.md): ramas, commits, PR, CI, revisión, deploy.
- [Definición de hecho](flujo/definicion-de-hecho.md): checklist de tarea y de revisión.

## Fuente

*Informe de arquitectura técnica* (7/10/2026) + correcciones de revisión. Donde el informe y estos docs difieren, los docs tienen la versión corregida y la [sección A de pendientes](pendientes.md#a-cambios-a-llevar-al-informe) lista qué falta llevar al informe.

## Mantener la documentación

- Un cambio de contrato, modelo o decisión actualiza docs/ **en el mismo PR**.
- Diagramas en Mermaid (se versionan como texto).
- Si un doc contradice al código, uno de los dos tiene un bug: se arregla, no se ignora.
