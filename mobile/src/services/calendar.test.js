import * as Calendar from 'expo-calendar'

import { MAX_BUSY_SLOTS, readBusySlots } from './calendar.js'

const NOW = new Date('2026-10-12T15:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const event = (start, end, extra = {}) => ({ id: 'e', title: 'Médico', location: 'Clínica', notes: 'privado', startDate: start, endDate: end, allDay: false, ...extra })

function withCalendar (events) {
  Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' })
  Calendar.getCalendarsAsync.mockResolvedValue([{ id: 'cal-1' }, { id: 'cal-2' }])
  Calendar.getEventsAsync.mockResolvedValue(events)
}

describe('services/calendar · readBusySlots', () => {
  it('sin permiso devuelve null y no lee nada (no se envía nada al back)', async () => {
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'denied' })

    expect(await readBusySlots({ now: NOW })).toBeNull()
    expect(Calendar.getCalendarsAsync).not.toHaveBeenCalled()
    expect(Calendar.getEventsAsync).not.toHaveBeenCalled()
  })

  it('lee los próximos 30 días de todos los calendarios', async () => {
    withCalendar([])

    const result = await readBusySlots({ now: NOW })

    expect(Calendar.getCalendarsAsync).toHaveBeenCalledWith(Calendar.EntityTypes.EVENT)
    expect(Calendar.getEventsAsync).toHaveBeenCalledWith(['cal-1', 'cal-2'], NOW, new Date(NOW.getTime() + 30 * DAY_MS))
    expect(result).toEqual({ from: '2026-10-12T15:00:00.000Z', to: '2026-11-11T15:00:00.000Z', busy: [] })
  })

  it('solo manda inicio y fin de cada evento: nunca título, lugar ni notas', async () => {
    withCalendar([event('2026-10-13T18:00:00.000Z', '2026-10-13T19:00:00.000Z')])

    const { busy } = await readBusySlots({ now: NOW })

    expect(busy).toEqual([{ start: '2026-10-13T18:00:00.000Z', end: '2026-10-13T19:00:00.000Z' }])
    expect(JSON.stringify(busy)).not.toMatch(/Médico|Clínica|privado/)
  })

  it('ignora los eventos de día completo y los que no tienen un horario válido; ordena por inicio', async () => {
    withCalendar([
      event('2026-10-15T10:00:00.000Z', '2026-10-15T11:00:00.000Z'),
      event('2026-10-14T00:00:00.000Z', '2026-10-15T00:00:00.000Z', { allDay: true }),
      event('2026-10-13T10:00:00.000Z', '2026-10-13T11:00:00.000Z'),
      event('2026-10-16T12:00:00.000Z', '2026-10-16T12:00:00.000Z'),
      event('no-es-fecha', '2026-10-16T13:00:00.000Z')
    ])

    const { busy } = await readBusySlots({ now: NOW })

    expect(busy.map((slot) => slot.start)).toEqual(['2026-10-13T10:00:00.000Z', '2026-10-15T10:00:00.000Z'])
  })

  it('manda como máximo 200 franjas (las primeras)', async () => {
    const many = Array.from({ length: MAX_BUSY_SLOTS + 50 }, (_, i) => {
      const start = new Date(NOW.getTime() + (i + 1) * 60 * 60 * 1000)
      return event(start.toISOString(), new Date(start.getTime() + 30 * 60 * 1000).toISOString())
    })
    withCalendar(many.reverse())

    const { busy } = await readBusySlots({ now: NOW })

    expect(busy).toHaveLength(MAX_BUSY_SLOTS)
    expect(busy[0].start).toBe(new Date(NOW.getTime() + 60 * 60 * 1000).toISOString())
  })

  it('sin calendarios devuelve el período sin franjas', async () => {
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' })
    Calendar.getCalendarsAsync.mockResolvedValue([])

    expect((await readBusySlots({ now: NOW })).busy).toEqual([])
    expect(Calendar.getEventsAsync).not.toHaveBeenCalled()
  })

  it('si leer el calendario falla devuelve null (el feed sigue funcionando)', async () => {
    Calendar.requestCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' })
    Calendar.getCalendarsAsync.mockRejectedValue(new Error('boom'))

    expect(await readBusySlots({ now: NOW })).toBeNull()
  })
})
