// Parámetros y textos de los avisos push (S5-BE-08). Un solo lugar: cambiarlos es un cambio de código.
// Los textos no llevan datos sensibles (ni ubicación ni texto del chat): solo el título del plan y un nombre público.

/** El recordatorio sale cuando faltan como mucho 60 minutos para el comienzo (docs/pendientes.md#jobs-programados). */
export const REMINDER_LEAD_MS = 60 * 60 * 1000

/** Tipos de aviso: viajan en `data.type` para que la app sepa qué abrir. */
export const NOTIFICATION_TYPES = Object.freeze({
  PLAN_JOINED: 'plan.joined',
  SPOT_FREED: 'plan.spot_freed',
  REMINDER: 'plan.reminder',
  MESSAGE: 'chat.message'
})

const quoted = (title) => `"${title}"`

export const NOTIFICATION_TEXTS = Object.freeze({
  [NOTIFICATION_TYPES.PLAN_JOINED]: ({ plan, name }) => ({
    title: 'Nueva inscripción',
    body: `${name ?? 'Alguien'} se sumó a ${quoted(plan.title)}.`
  }),
  [NOTIFICATION_TYPES.SPOT_FREED]: ({ plan }) => ({
    title: 'Se liberó un lugar',
    body: `Hay lugar en ${quoted(plan.title)}. Quien se inscriba primero se lo queda.`
  }),
  [NOTIFICATION_TYPES.REMINDER]: ({ plan }) => ({
    title: 'Tu plan empieza pronto',
    body: `${quoted(plan.title)} empieza en menos de una hora.`
  }),
  // Nunca el texto del mensaje (regla 13 / doc 08): solo quién escribió y en qué plan.
  [NOTIFICATION_TYPES.MESSAGE]: ({ plan, name }) => ({
    title: 'Mensaje nuevo',
    body: `${name ?? 'Alguien'} escribió en ${quoted(plan.title)}.`
  })
})
