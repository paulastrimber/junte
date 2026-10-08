# 0003 · Socket.io solo con transporte WebSocket, sin stickiness

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

Por defecto, Socket.io abre la conexión con long-polling HTTP y luego hace *upgrade* a WebSocket. Durante el polling, cada request tiene que llegar a **la misma instancia** del back. En junte hay dos balanceadores en el camino (ALB público → Nginx → ALB interno → Express); sin afinidad, el handshake falla de forma intermitente. El informe no tomaba una decisión.

## Decisión

Forzar `transports: ['websocket']` en el cliente y en el servidor. No se habilita stickiness en ningún target group. Redis (`@socket.io/redis-adapter`) distribuye los eventos entre instancias. Idle timeout de los dos ALB en 300 s.

## Alternativas consideradas

- **Stickiness en los dos target groups** (cookie del ALB): funciona, pero agrega estado al balanceo, distribuye peor la carga y depende de que la cookie atraviese Nginx correctamente en ambos saltos.
- **Dejar polling como fallback de Socket.io**: reintroduce el problema.

## Consecuencias

- Redes que bloquean WebSocket no pueden usar el chat en tiempo real; para eso ya existe el fallback de polling **REST** (`GET /plans/:id/messages`), que es stateless.
- Nginx debe reenviar los headers `Upgrade`/`Connection` y tener `proxy_read_timeout` ≥ 300 s.
- React Native soporta WebSocket nativamente, así que no hay costo en el cliente.
