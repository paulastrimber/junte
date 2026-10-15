# Rediseño visual de la app móvil

- **Autor:** @paustever
- **Fecha:** 2026-10-12T18:05:15-03:00

## Prompt

Quiero mejorar el diseño visual de toda la app (mobile/) para que se vea moderna, prolija y nativa, usando las skills de Expo instaladas en .claude/skills (building-native-ui y expo-ui sobre todo).

Reglas:
- No cambies el comportamiento, la navegación ni los contratos con la API: es un cambio visual. La app sigue con React Navigation (no migrar a Expo Router) y con screens → hooks → services.
- Si una mejora necesita una dependencia nueva, preguntame antes de instalarla.
- Trabajá en una rama nueva (feat/ui-redesign) creada desde main con S4 mergeado.

Cómo hacerlo:
1. Antes de tocar código, haceme las preguntas que necesites (estilo, colores, nombre/marca "junte", modo oscuro, etc.) y proponeme un sistema de diseño: paleta, tipografía, espaciados, bordes, sombras, íconos y componentes base (botones, inputs, tarjetas, chips de intereses, estados vacíos, cargando y error). Mostrámelo antes de aplicarlo.
2. Una vez aprobado, crealo como tema y componentes reutilizables en src/components y un archivo de tema (sin colores sueltos en las pantallas).
3. Aplicalo pantalla por pantalla, en este orden: login/registro, onboarding, feed y filtros, detalle del plan, crear/editar plan con mapa, Mis planes, QR y check-in, perfil.
4. Cuidá: modo claro y oscuro, accesibilidad (contraste, tamaños táctiles, labels para lectores de pantalla), teclado que no tape los campos, y que se vea bien en Android y en iPhone.
5. Hacé un commit por pantalla o grupo de pantallas, con los tests y el lint en verde (actualizá los tests que dependan del texto o la estructura, sin quitar cobertura).
6. Documentá el sistema de diseño en docs/ (por ejemplo docs/practicas/diseno-ui.md) y sumá una línea en CLAUDE.md para que todo el equipo lo use en pantallas nuevas.

Al terminar cada grupo de pantallas avisame para probarlo en el celular con Expo Go antes de seguir.
