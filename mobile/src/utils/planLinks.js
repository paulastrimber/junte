// Enlaces a un plan (invitar compartiendo, S5-MOB-05; decidido en docs/pendientes.md#notas-de-voz-y-contactos): abren
// la app instalada en el detalle del plan. No hay página web: quien no tiene la app ve el texto con el título y la fecha.
import { formatSchedule } from './plans.js'

export const APP_SCHEME = 'junte'

/** @param {string} planId @returns {string} `junte://plans/<id>` */
export const planLink = (planId) => `${APP_SCHEME}://plans/${planId}`

/** @returns {string | null} el ID del plan de un enlace `junte://plans/<id>` (o null si no es uno). */
export function planIdFromLink (url) {
  const match = typeof url === 'string' ? /^junte:\/\/+plans\/([0-9a-f]{24})\/?(?:[?#].*)?$/.exec(url) : null
  return match ? match[1] : null
}

/**
 * Texto para invitar a alguien a un plan (por WhatsApp, mensaje, etc.): sin contactos, nada sale del teléfono hacia el
 * back. Lleva el título, cuándo y dónde, y el enlace que abre el plan en la app.
 * @param {{ id: string, title: string, startsAt: string, endsAt: string, location: { label: string } }} plan
 * @param {(startsAt: string, endsAt: string) => string} [formatWhen]
 */
export function planInviteMessage (plan, formatWhen = defaultWhen) {
  return `Sumate a "${plan.title}" en junte: ${formatWhen(plan.startsAt, plan.endsAt)}, ${plan.location.label}.\n${planLink(plan.id)}`
}

function defaultWhen (startsAt, endsAt) {
  return formatSchedule(startsAt, endsAt)
}
