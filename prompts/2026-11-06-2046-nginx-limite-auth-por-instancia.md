# Nginx: límite de auth dividido por instancia

- **Autor:** @paustever
- **Fecha:** 2026-11-06T20:46:25-03:00

## Prompt

Contexto: proyecto junte. En entrega hay 2 Nginx (FrontCount=2) detrás del ALB y cada uno
cuenta el rate limit por separado (limit_req_zone es local a cada instancia). El límite
efectivo de /api/v1/auth/* queda en ~2× el configurado (zona auth: 10r/m, burst=5 en
front-service/conf.d/10-ratelimit.conf y 30-server.conf). Lo vimos en el paso 7.1 (PR #33, #34).

Lo que necesito (arreglo mínimo, sin cambiar la arquitectura):
1. Mostrame cómo se arma hoy la config de Nginx en AWS (templates de front-service/,
   variables NGINX_* y cómo las pasa infra/templates/50-front.yml) antes de cambiar nada.
2. Hacé configurables la tasa y el burst de la zona auth con variables NGINX_* (por ejemplo
   NGINX_AUTH_RATE y NGINX_AUTH_BURST), con los valores actuales por defecto, así local y dev
   (1 Nginx) no cambian.
3. En entrega, que el límite por instancia se divida por FrontCount, para que el total
   entre todas las instancias sea el mismo que hoy con una sola. Proponé cómo pasarlo
   (parámetro en infra/parameters/entrega/50-front.json o derivado de FrontCount en el
   template) y explicá por qué es aproximado (el ALB no reparte exacto).
4. No debilites el smoke test. Si algún chequeo depende del número exacto de requests hasta
   el 429, ajustalo para que siga probando lo mismo con N instancias, y explicame el cambio.
5. Corré el smoke test local y mostrame el resultado.
6. Documentá la limitación y la decisión en docs/arquitectura/04-front-service.md.
7. Rama fix/nginx-auth-rate-per-instance, commit Conventional Commits en inglés, docs en
   español, PR contra main. En la descripción: hay que relanzar task aws:up ENV=entrega y el
   smoke test en la cuenta B para comprobarlo; la alternativa de fondo (límite compartido
   en el back con Redis) queda para decidir con Paula.

No muestres IDs de cuenta (12 dígitos) ni valores de secretos.
