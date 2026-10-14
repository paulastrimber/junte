# Sprint 5: chat

- **Autor:** @mperez14ang
- **Fecha:** 2026-10-14

## Resumen

- Se tomó el Sprint 5 (el 4 ya estaba mergeado). Alcance: chat completo (S5-BE-01..05, S5-NG-01 local, S5-MOB-01/02); FCM, avisos, `spotAlerts` y notas de voz quedan para PRs siguientes.
- Decisiones: notas de voz aprobadas para después del chat de texto (`type: 'text'` desde ya); `clientId` idempotente por socket y por REST.
- Se partió en PR de back (#8) y de app (#9/#10), con revisión de un subagente sin contexto; sus sugerencias se corrigieron en los mismos PRs.
- Validación local: dos instancias con Redis, smoke de Nginx y e2e del chat por Nginx, todo OK; falta la prueba en el teléfono.
