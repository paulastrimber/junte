# Definición de hecho

Una tarea está **hecha** solo si cumple todo lo que aplica. "Funciona en mi máquina" no es hecho.

## Checklist de la tarea

**Funcional**
- [ ] Cumple los criterios de aceptación de la tarea.
- [ ] Probado manualmente en un teléfono (o emulador) si toca la app.
- [ ] Contempla los casos de error, no solo el camino feliz.

**Código**
- [ ] Respeta las capas: sin negocio en controladores ni screens, sin `express`/`mongoose` en servicios.
- [ ] Identidad desde el token; campos solo-backend rechazados.
- [ ] Toda entrada validada con Zod (`.strict()`).
- [ ] Errores con `AppError` y `code` del catálogo.
- [ ] Lint sin errores.

**Tests**
- [ ] Tests unitarios del servicio/hook nuevo o modificado.
- [ ] Test de contrato si se agregó o cambió un endpoint.
- [ ] Test de integración si hay query, índice o transacción nueva.
- [ ] Si arregla un bug: test que lo reproduce.
- [ ] CI en verde.

**Datos**
- [ ] Índices/campos nuevos por migración con `up` y `down`.
- [ ] Esquema Mongoose y migración en el mismo PR.

**Seguridad**
- [ ] Sin secretos en el código ni en `EXPO_PUBLIC_*`.
- [ ] Los logs nuevos no incluyen tokens, contraseñas ni coordenadas.
- [ ] Permisos verificados en el servicio (propiedad, participación, rol).

**Documentación**
- [ ] `docs/arquitectura/06-api.md` actualizado si cambió el contrato.
- [ ] `07-modelo-de-datos.md` actualizado si cambió el modelo.
- [ ] ADR si se tomó una decisión de arquitectura.
- [ ] Pendiente resuelto marcado en `docs/pendientes.md`.

**Integración**
- [ ] PR aprobado y mergeado a `main`.
- [ ] Tarea marcada como hecha en el tablero.

## Checklist de revisión

Para quien revisa el PR. Las primeras cuatro son bloqueantes.

1. **¿Rompe alguna regla de negocio innegociable?** (cupos sin transacción, identidad desde el body, ubicación persistida, reportes expuestos)
2. **¿Hay un agujero de seguridad?** (falta `authenticate`/`requireRole`, query construida con input del cliente, dato sensible en log o respuesta)
3. **¿Los tests prueban el comportamiento pedido**, incluidos los casos de error?
4. **¿Cambió el contrato o el modelo sin actualizar docs/ y sin migración?**
5. ¿Cada pieza está en la capa correcta?
6. ¿Se entiende sin que el autor lo explique? Nombres, funciones cortas.
7. ¿Hay duplicación que debería ser una función de `shared/` o de un módulo?
8. ¿Hay efectos secundarios (push, logs) dentro de la transacción?
