# Sprint 5: chat

- **Autor:** @mperez14ang
- **Fecha:** 2026-10-14

## Resumen

- Se tomó el Sprint 5. Alcance: el chat completo (S5-BE-01 a 05, S5-NG-01 en local, S5-MOB-01 y 02); FCM, avisos, `spotAlerts` y notas de voz quedan para PRs siguientes.
- Decisiones: notas de voz aprobadas para después del chat de texto (`type: 'text'` desde ya); `clientId` idempotente por socket y por REST.
- Se partió en dos PRs, back (#8) y app (#10), revisados por un subagente sin contexto; sus sugerencias se corrigieron en los mismos PRs.
- Validación en local: chat y jobs con dos instancias y Redis, smoke de Nginx y e2e del chat por Nginx, todo OK. La app se probó en el simulador de iOS con Expo Go y se corrigieron los dos bugs que aparecieron. Falta ver el teclado en un teléfono.
