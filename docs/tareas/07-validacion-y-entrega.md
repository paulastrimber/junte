# Sprint 7 · Validación y entrega

**Objetivo:** demostrar con evidencia que lo que dice el informe es verdad en el sistema desplegado.

**Entregable:** APK instalable, servicios desplegados, documentación actualizada y carpeta de evidencia con resultados y limitaciones conocidas.

## Pruebas

- [ ] **S7-QA-01 · E2E con Maestro** en el APK: registro → perfil → feed → crear plan → inscribirse → check-in → chat → reportar.
- [ ] **S7-QA-02 · Concurrencia en AWS**: script que dispara N inscripciones simultáneas al ALB público; cupo nunca superado.
- [ ] **S7-QA-03 · Seguridad**: checklist de [09-seguridad.md](../arquitectura/09-seguridad.md#checklist-de-verificación-sprint-7) completo.
- [ ] **S7-QA-04 · Aislamiento de red**: desde Internet no responden 8080, 3000, 6379, 27017, 22; cada salto solo alcanza al siguiente (pruebas desde Session Manager).
- [ ] **S7-QA-05 · Rate limit por IP real**: dos clientes con IPs distintas; uno limitado no afecta al otro; 429 con `requestId`.
- [ ] **S7-QA-06 · Disponibilidad**: detener una instancia de Nginx, una de Express y el primario de MongoDB (de a una) → el servicio sigue respondiendo.
  *Cierra también* S1-INF-08 (`rs.status()` con 3 miembros y elección de primario) y S1-INF-09 (back en 2 AZ), que en dev quedaron con una instancia por capa. En la cuenta B: `task aws:mongo-init ENV=entrega` y `task aws:up ENV=entrega` ([plan, paso 7.1](../infra/plan-aws.md)).
- [ ] **S7-QA-07 · NAT por zona**: con la ruta de una zona deshabilitada, el back de la otra sigue enviando push.
- [ ] **S7-QA-08 · WebSocket ocioso** 5 minutos sigue conectado.
- [ ] **S7-QA-09 · Restauración de MongoDB** desde backup, con tiempos medidos.
- [ ] **S7-QA-10 · Logs**: búsqueda en CloudWatch de `password`, `Bearer`, `refreshToken`, `latitude` → sin resultados.

## Entrega

- [ ] **S7-MOB-01 · APK** con EAS (perfil de entrega, URLs de producción), probado en al menos dos teléfonos Android.
- [ ] **S7-DOC-01 · Informe actualizado** con todos los cambios de la [sección A de pendientes](../pendientes.md#a-cambios-a-llevar-al-informe).
- [ ] **S7-DOC-02 · `docs/evidencia/`**: capturas, salidas de comandos, resultados de cada prueba de este sprint.
- [ ] **S7-DOC-03 · Limitaciones conocidas**: tramos internos sin TLS, QR/ubicación no son antifraude absoluto, sesión única por usuario (si se mantuvo), redes que bloquean WebSocket usan polling.
- [ ] **S7-DOC-04 · Demo**: guion de 10 minutos con datos semilla preparados.
