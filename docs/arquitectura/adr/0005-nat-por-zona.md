# 0005 · Un NAT Gateway por zona de disponibilidad

- **Estado:** Aceptada
- **Fecha:** 2026-10-07

## Contexto

El back necesita salida a Internet (FCM, dependencias). El informe decía "salida controlada, por ejemplo mediante NAT", en singular. Un NAT Gateway vive en una sola zona: si esa zona cae, todas las subredes privadas que lo usan pierden salida, incluidas las de la otra zona, y con ellas las notificaciones push. El resto del diseño elimina puntos únicos de falla, así que este quedaba descolgado.

## Decisión

Un NAT Gateway en la subred pública de **cada** zona usada por borde y aplicación. La tabla de rutas de cada subred privada apunta al NAT de su misma zona. Se suman VPC endpoints (S3 gateway, Secrets Manager, CloudWatch Logs, SSM) para que ese tráfico no dependa del NAT.

## Alternativas consideradas

- **Un solo NAT** declarado como límite asumido: más barato, pero contradice el objetivo de disponibilidad del informe.
- **Instancia NAT propia**: más barata, pero hay que mantenerla y también es un punto único de falla.

## Consecuencias

- Duplica el costo fijo de NAT. Para ahorrar en la etapa de desarrollo se puede levantar uno solo, **dejándolo escrito** como desviación temporal y no en la configuración de entrega.
- Hay que actualizar la sección 7.1 del informe.
