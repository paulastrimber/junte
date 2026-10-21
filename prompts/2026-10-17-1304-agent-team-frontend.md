# Agent team para el frontend mobile

- **Autor:** @paustever
- **Fecha:** 2026-10-17T13:04:03-03:00

## Prompt

Creá un agent team para construir el frontend de Junte, una app en React Native para organizar planes entre estudiantes universitarios, con backend en AWS.

Primero analizá el código que ya existe en este proyecto (estructura, dependencias, navegación, pantallas, llamadas al backend) y respetalo; no reescribas desde cero lo que ya funciona. Proponé qué pantallas faltan o hay que mejorar.

Equipo:
1. Líder / Arquitecto mobile: define estructura de carpetas, navegación, manejo de estado y cómo se consume la API del backend. Divide el trabajo en tareas y coordina.
2. Diseñador UI/UX: usa la skill frontend-design. Define un design system (colores, tipografía, espaciados, componentes base) con identidad propia, joven y universitaria; evita la estética genérica. Revisa coherencia y accesibilidad en iOS y Android.
3. Dev React Native: usa las skills de Expo. Implementa pantallas y componentes según el design system.
4. Performance: usa react-native-best-practices. Revisa listas, re-renders, animaciones y bundle.
5. QA: escribe tests con Jest y React Native Testing Library para componentes y flujos principales, y reporta bugs al dev.
