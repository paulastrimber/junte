# Crear plan: auto-scroll, campos faltantes, asteriscos y feedback al enviar

- **Autor:** @paustever
- **Fecha:** 2026-10-18T09:41:21-03:00

## Prompt

Testeando a mano la pantalla de crear/editar plan (mobile/src/screens/CreatePlanScreen.jsx, hook usePlanForm.js, validación validatePlanForm en utils/plans.js) encontré estas mejoras. El alcance es SOLO esa pantalla y los componentes mínimos que haga falta tocar; no cambies otras pantallas ni el backend.

1. Auto-scroll: al tocar botones dentro del formulario no se scrollea solo. Por ejemplo, abrir el selector de fecha/hora en iOS (DateTimeField se despliega en línea), "Buscar" / "Usar mi ubicación" en LocationPicker (aparecen mensajes y se mueve el mapa) o el switch de cupo ilimitado (aparece u oculta el campo de cupo). Quiero que la vista se desplace para que se vea lo que aparece o cambia.

2. Campo faltante: si al tocar "Crear plan" falta algún campo, es difícil saber cuál. Quiero un aviso visible (cartelito) que diga qué falta y que la pantalla haga scroll al primer campo con error, siguiendo el orden visual del formulario. Lo mismo para los errores por campo que devuelve el servidor.

3. Asterisco (*) en todos los campos obligatorios según validatePlanForm. Revisá cuáles son realmente obligatorios; ojo con precio, que tiene default, y con cupo, que solo es obligatorio si no es ilimitado. Si FormField o DateTimeField necesitan una prop nueva (ej. `required`), que sea opcional y retrocompatible. Que el lector de pantalla anuncie que es obligatorio sin romper los tests existentes que usan getByLabelText(TEXTS.x).

4. Que nunca pase que toco "Crear plan" y no se crea nada sin feedback. Revisá todos los caminos de submit(): validación local, errores del server por campo, error general, doble toque mientras guarda y modo edición sin cambios. En cada caso tiene que haber feedback claro: aviso, scroll, estado de carga, evitar doble envío y anunciarlo a accesibilidad.

Organizá el trabajo con subagentes:
- Un diseñador UX/UI que primero revise la pantalla y defina el comportamiento y los textos (español rioplatense, voseo). Que separe recomendaciones fuera de alcance, que no se implementan.
- Un desarrollador que implemente según esa especificación.
- Un tester que agregue tests en CreatePlanScreen.test.jsx (scroll al primer error, aviso visible, asteriscos, doble toque, error del server) y corra `npm run lint` y `npm test` en mobile/.
- Al final, una revisión de que no se tocó nada fuera de alcance.

Seguí el CLAUDE.md (registrar este prompt en prompts/, Conventional Commits en inglés). Trabajá en una rama nueva y abrí un PR.
