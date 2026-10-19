// Métricas simples (GET /admin/metrics): totales y actividad de los últimos 7 días.
import { api } from '../api.js'
import { formatDate, h, render } from '../dom.js'

const metric = (label, value, details) => h('div', { class: 'card metric' },
  h('div', { class: 'muted' }, label),
  h('div', { class: 'value' }, String(value)),
  h('div', { class: 'sub' }, details.map(([name, count]) => `${name}: ${count}`).join(' · '))
)

/** @param {HTMLElement} container */
export async function mountMetrics (container) {
  const data = await api('GET', '/admin/metrics')
  render(container,
    h('h1', {}, 'Métricas'),
    h('p', { class: 'muted' }, `Actualizado el ${formatDate(data.generatedAt)} · "Nuevos" son los de los últimos ${data.windowDays} días`),
    h('div', { class: 'metrics' },
      metric('Reportes pendientes', data.reports.pending, [['Nuevos', data.reports.createdSince]]),
      metric('Usuarios', data.users.total, [['Nuevos', data.users.createdSince], ['Suspendidos', data.users.suspended]]),
      metric('Planes', data.plans.total, [['Nuevos', data.plans.createdSince]]),
      metric('Inscripciones activas', data.participations.active, [['Nuevas', data.participations.joinedSince]]),
      metric('Check-ins', data.checkIns.total, [['Nuevos', data.checkIns.createdSince]]),
      metric('Mensajes del chat', data.messages.total, [['Nuevos', data.messages.createdSince], ['Ocultos', data.messages.hidden]])
    )
  )
}
