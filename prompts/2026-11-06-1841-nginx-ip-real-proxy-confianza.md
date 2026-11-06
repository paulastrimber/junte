# Nginx: IP real solo desde el proxy de confianza

- **Autor:** @paustever
- **Fecha:** 2026-11-06T18:41:47-03:00

## Prompt

Contexto: proyecto junte. En el paso 7.1 de docs/infra/plan-aws.md desplegué el entorno
"entrega" en la cuenta B con `task aws:bootstrap ENV=entrega`. Todo quedó sano y
`task aws:verify` pasó, pero el smoke test del front service falló en 1 de 33 chequeos:

  Rate limit en /api/v1/auth/login
    [ OK ] ráfaga → 429 en el request 14
    [FAIL] con un X-Forwarded-For inventado el cliente externo evadió el límite (400)

Y este se saltea en AWS, así que el caso "confiar solo en la red de confianza" nunca se
probó contra el entorno real:
    [SKIP] requiere el entorno local de docker compose (base_url local y SMOKE_SKIP_LOCAL != 1)

Problema: en AWS, Nginx usa como IP del cliente un X-Forwarded-For que el propio cliente
puede inventar, y con eso evade la zona estricta de limit_req de /api/v1/auth/*.

Lo que necesito:
1. Encontrá en front-service/ (y donde se arme la config de Nginx que se sube a
   s3://<bucket-ops>/nginx/ y usa infra/templates/50-front.yml) cómo se resuelve la IP real:
   set_real_ip_from, real_ip_header, real_ip_recursive y la key de limit_req_zone.
2. Explicame qué hay delante de Nginx en AWS (NLB, ALB o nada) según infra/templates/,
   y por qué hoy se puede falsear la IP. Mostrame las líneas exactas antes de cambiar nada.
3. Proponé el arreglo mínimo para que Nginx confíe solo en lo que agrega el balanceador
   (o en ninguno si no hay ALB), sin romper el entorno local de docker compose, donde
   el chequeo "Rate limit por IP real (X-Forwarded-For desde la red de confianza)" tiene
   que seguir pasando.
4. No debilites ni saltees el chequeo del smoke test que falló: el arreglo tiene que
   hacerlo pasar a él.
5. Corré el smoke test local y mostrame el resultado.
6. Rama `fix/nginx-real-ip-trusted-proxy`, commit Conventional Commits en inglés,
   docs en español, y PR contra main que explique la causa y cómo se verificó.
   En la descripción dejá anotado que hay que relanzar `task aws:up ENV=entrega` y el
   smoke test en la cuenta B para cerrarlo.

No muestres IDs de cuenta (12 dígitos) ni valores de secretos.
