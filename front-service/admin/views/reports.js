// Cola de reportes: pendientes (del más viejo al más nuevo) e historial de revisados y descartados. Cada tarjeta
// muestra qué se reportó y las acciones de moderación: ocultar/mostrar el mensaje, suspender/reactivar la cuenta
// responsable y resolver el reporte (resolver uno resuelve todos los pendientes sobre lo mismo).
import { api } from '../api.js'
import { busy, formatDate, h, render } from '../dom.js'

const STATUSES = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'reviewed', label: 'Revisados' },
  { key: 'dismissed', label: 'Descartados' }
]

const REASONS = { spam: 'Spam', harassment: 'Acoso', inappropriate: 'Contenido inapropiado', scam: 'Estafa', other: 'Otro motivo' }
const TARGETS = { message: 'Mensaje del chat', plan: 'Plan', user: 'Usuario' }
const PLAN_STATUSES = { open: 'abierto', closed: 'inscripciones cerradas', cancelled: 'cancelado', completed: 'terminado' }
const RESOLUTIONS = { reviewed: 'Revisado', dismissed: 'Descartado' }

const userLabel = (user) => (user ? `${user.name ?? 'Sin nombre'} · ${user.email}` : 'Cuenta eliminada')

/**
 * @param {HTMLElement} container
 * @param {{ notify: (message: string, options?: { ok?: boolean, requestId?: string | null }) => void }} ui
 */
export function mountReports (container, ui) {
  let status = 'pending'
  let items = []
  let nextCursor = null

  async function load ({ more = false } = {}) {
    const query = new URLSearchParams({ status, limit: '20', ...(more && nextCursor ? { cursor: nextCursor } : {}) })
    const page = await api('GET', `/admin/reports?${query}`)
    items = more ? [...items, ...page.items] : page.items
    nextCursor = page.nextCursor
    draw()
  }

  async function run (button, action, okMessage) {
    await busy(button, async () => {
      try {
        await action()
        ui.notify(okMessage, { ok: true })
        await load()
      } catch (error) {
        ui.notify(error.message, { requestId: error.requestId })
      }
    })
  }

  /** La cuenta responsable de lo reportado: quien escribió el mensaje, quien creó el plan o el usuario reportado. */
  function responsibleOf ({ type, preview }) {
    if (!preview) return null
    if (type === 'message') return preview.sender
    if (type === 'plan') return preview.creator
    return preview
  }

  function previewOf ({ type, preview }) {
    if (!preview) return h('p', { class: 'muted' }, 'Lo reportado ya no existe.')
    const rows = []
    if (type === 'message') {
      const content = preview.type === 'voice'
        ? `Nota de voz (${Math.max(1, Math.round((preview.durationMs ?? 0) / 1000))} s)`
        : preview.text
      rows.push(['Mensaje', h('blockquote', { class: 'quote' }, content)])
      rows.push(['Escrito por', userLabel(preview.sender)])
      rows.push(['En el plan', preview.plan?.title ?? '—'])
      rows.push(['Enviado', formatDate(preview.createdAt)])
      rows.push(['Estado', preview.status === 'hidden' ? 'Oculto' : 'Visible'])
    } else if (type === 'plan') {
      rows.push(['Título', preview.title])
      if (preview.description) rows.push(['Descripción', h('blockquote', { class: 'quote' }, preview.description)])
      rows.push(['Lugar', preview.locationLabel])
      rows.push(['Empieza', formatDate(preview.startsAt)])
      rows.push(['Estado', PLAN_STATUSES[preview.status] ?? preview.status])
      rows.push(['Creado por', userLabel(preview.creator)])
    } else {
      rows.push(['Cuenta', userLabel(preview)])
      rows.push(['Reputación', String(preview.reputation)])
      rows.push(['Registrada', formatDate(preview.createdAt)])
    }
    return h('dl', { class: 'preview' }, rows.map(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]))
  }

  function actionsOf (report) {
    const { target } = report
    const buttons = []

    if (target.type === 'message' && target.preview) {
      const hidden = target.preview.status === 'hidden'
      buttons.push(h('button', {
        type: 'button',
        class: hidden ? 'secondary' : 'danger',
        onClick: (event) => run(event.currentTarget,
          () => api('PATCH', `/admin/messages/${target.id}`, { status: hidden ? 'visible' : 'hidden' }),
          hidden ? 'El mensaje vuelve a estar visible.' : 'Mensaje oculto: ya no lo ve nadie en el chat.')
      }, hidden ? 'Volver a mostrar el mensaje' : 'Ocultar mensaje'))
    }

    const responsible = responsibleOf(target)
    if (responsible && responsible.role !== 'admin') {
      const suspended = responsible.status === 'suspended'
      buttons.push(h('button', {
        type: 'button',
        class: suspended ? 'secondary' : 'danger',
        onClick: (event) => {
          const question = suspended
            ? `¿Reactivar la cuenta de ${userLabel(responsible)}?`
            : `¿Suspender la cuenta de ${userLabel(responsible)}? Se cierran todas sus sesiones y no puede volver a entrar hasta que la reactives.`
          if (!window.confirm(question)) return
          run(event.currentTarget,
            () => api('PATCH', `/admin/users/${responsible.id}`, { status: suspended ? 'active' : 'suspended' }),
            suspended ? 'Cuenta reactivada.' : 'Cuenta suspendida.')
        }
      }, suspended ? 'Reactivar cuenta' : 'Suspender cuenta'))
    }

    const resolutions = report.status === 'pending' ? ['reviewed', 'dismissed'] : ['reviewed', 'dismissed'].filter((key) => key !== report.status)
    for (const resolution of resolutions) {
      const label = report.status === 'pending'
        ? (resolution === 'reviewed' ? 'Marcar revisado' : 'Descartar')
        : `Cambiar a "${RESOLUTIONS[resolution].toLowerCase()}"`
      buttons.push(h('button', {
        type: 'button',
        class: resolution === 'reviewed' && report.status === 'pending' ? 'primary' : 'secondary',
        onClick: (event) => run(event.currentTarget,
          () => api('PATCH', `/admin/reports/${report.id}`, { status: resolution }),
          resolution === 'reviewed' ? 'Reporte marcado como revisado.' : 'Reporte descartado.')
      }, label))
    }
    return h('div', { class: 'actions' }, buttons)
  }

  function card (report) {
    const { target } = report
    return h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('span', { class: 'reason' }, REASONS[report.reason] ?? report.reason),
        h('span', { class: 'badge' }, TARGETS[target.type] ?? target.type),
        target.pendingReports > 1 && h('span', { class: 'badge alert' }, `${target.pendingReports} reportes pendientes sobre esto`),
        report.status !== 'pending' && h('span', { class: 'badge' }, RESOLUTIONS[report.status]),
        h('span', { class: 'muted' }, formatDate(report.createdAt))
      ),
      report.description && h('blockquote', { class: 'quote' }, report.description),
      h('p', { class: 'muted' }, `Reportado por ${userLabel(report.reporter)}`),
      previewOf(target),
      report.resolvedAt && h('p', { class: 'muted' }, `${RESOLUTIONS[report.status]} por ${report.resolvedBy?.name ?? 'una cuenta eliminada'} · ${formatDate(report.resolvedAt)}`),
      actionsOf(report)
    )
  }

  function draw () {
    const tabs = STATUSES.map(({ key, label }) => h('button', {
      type: 'button',
      class: 'chip',
      'aria-pressed': String(key === status),
      onClick: () => { status = key; load().catch((error) => ui.notify(error.message, { requestId: error.requestId })) }
    }, label))

    render(container,
      h('h1', {}, 'Reportes'),
      h('div', { class: 'toolbar' }, tabs, h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'secondary', onClick: (event) => run(event.currentTarget, async () => {}, 'Lista actualizada.') }, 'Actualizar')),
      items.length === 0
        ? h('p', { class: 'empty' }, status === 'pending' ? 'No hay reportes pendientes.' : 'Todavía no hay reportes en esta lista.')
        : h('div', { class: 'list' }, items.map(card)),
      nextCursor && h('div', { class: 'toolbar' },
        h('button', {
          type: 'button',
          class: 'secondary',
          onClick: (event) => busy(event.currentTarget, () => load({ more: true }).catch((error) => ui.notify(error.message, { requestId: error.requestId })))
        }, 'Cargar más'))
    )
  }

  return load()
}
