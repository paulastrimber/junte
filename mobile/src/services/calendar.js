// Calendario del teléfono (expo-calendar), para la compatibilidad horaria del feed.
// Privacidad: del calendario solo sale de la app CUÁNDO está ocupada la persona (inicio y fin de cada evento);
// nunca títulos, lugares ni invitados. Sin permiso no se manda nada (el back usa un valor neutral).
import * as Calendar from 'expo-calendar'

/** Período que se lee y máximo de franjas que acepta el back (POST /feed). */
export const CALENDAR_WINDOW_DAYS = 30
export const MAX_BUSY_SLOTS = 200

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Franjas ocupadas de los próximos 30 días.
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ from: string, to: string, busy: Array<{ start: string, end: string }> } | null>}
 *   null si no hay permiso o no se pudo leer el calendario.
 */
export async function readBusySlots ({ now = new Date() } = {}) {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync()
    if (status !== 'granted') return null

    const from = now
    const to = new Date(now.getTime() + CALENDAR_WINDOW_DAYS * DAY_MS)
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    if (calendars.length === 0) return { from: from.toISOString(), to: to.toISOString(), busy: [] }

    const events = await Calendar.getEventsAsync(calendars.map((calendar) => calendar.id), from, to)
    const busy = events
      // Los eventos de día completo (cumpleaños, feriados) no cuentan como ocupado.
      .filter((event) => !event.allDay)
      .map((event) => ({ start: new Date(event.startDate), end: new Date(event.endDate) }))
      .filter(({ start, end }) => !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start)
      .sort((a, b) => a.start - b.start)
      .slice(0, MAX_BUSY_SLOTS)
      .map(({ start, end }) => ({ start: start.toISOString(), end: end.toISOString() }))

    return { from: from.toISOString(), to: to.toISOString(), busy }
  } catch {
    return null
  }
}
