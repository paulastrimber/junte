// Edición de catálogos (ADR-0009): renombrar, ordenar, activar/desactivar y sumar opciones. Nunca se borran: una opción
// desactivada deja de ofrecerse, pero quien ya la eligió la conserva. La key y el "padre" no cambian después de crear.
import { api } from '../api.js'
import { busy, h, render } from '../dom.js'

/** Por catálogo: nombre, "padre" (solo al crear) y campos propios editables. */
const CATALOGS = {
  'interest-categories': { label: 'Categorías de intereses', extras: [] },
  interests: { label: 'Intereses', parent: { field: 'categoryKey', label: 'Categoría (key)' }, extras: [{ field: 'minAge', label: 'Edad mínima', type: 'number', nullable: true }] },
  universities: { label: 'Universidades', extras: [{ field: 'shortName', label: 'Sigla', type: 'text', required: true }] },
  careers: { label: 'Carreras', parent: { field: 'universityKey', label: 'Universidad (key)' }, extras: [{ field: 'group', label: 'Facultad / área', type: 'text', nullable: true }] },
  cities: { label: 'Ciudades', extras: [{ field: 'department', label: 'Departamento', type: 'text', required: true }] },
  neighborhoods: { label: 'Barrios', parent: { field: 'cityKey', label: 'Ciudad (key)' }, extras: [] }
}

/** Valor de un input según su tipo: número, texto, o null si quedó vacío en un campo que se puede quitar. */
function readInput (input, { type, nullable }) {
  const raw = input.value.trim()
  if (raw === '') return nullable ? null : undefined
  return type === 'number' ? Number(raw) : raw
}

/**
 * @param {HTMLElement} container
 * @param {{ notify: (message: string, options?: { ok?: boolean, requestId?: string | null }) => void }} ui
 */
export function mountCatalogs (container, ui) {
  let catalog = 'interests'
  let rows = []
  let filter = ''

  const fail = (error) => ui.notify(error.message, { requestId: error.requestId })

  async function load () {
    rows = (await api('GET', `/admin/catalogs/${catalog}`)).items
    draw()
  }

  function newRowForm () {
    const definition = CATALOGS[catalog]
    const inputs = {
      key: h('input', { type: 'text', name: 'key', required: true, placeholder: 'salir-a-correr', pattern: '[a-z0-9]+(-[a-z0-9]+)*' }),
      name: h('input', { type: 'text', name: 'name', required: true }),
      order: h('input', { type: 'number', name: 'order', min: '0', value: '0' })
    }
    if (definition.parent) inputs[definition.parent.field] = h('input', { type: 'text', name: definition.parent.field, required: true })
    for (const extra of definition.extras) inputs[extra.field] = h('input', { type: extra.type, name: extra.field, required: Boolean(extra.required), ...(extra.type === 'number' ? { min: '16', max: '99' } : {}) })

    const labels = { key: 'Key', name: 'Nombre', order: 'Orden', ...(definition.parent ? { [definition.parent.field]: definition.parent.label } : {}) }
    for (const extra of definition.extras) labels[extra.field] = extra.label

    const submit = h('button', { type: 'submit', class: 'primary' }, 'Agregar opción')
    return h('form', {
      class: 'new-row',
      onSubmit: (event) => {
        event.preventDefault()
        const body = { key: inputs.key.value.trim(), name: inputs.name.value.trim(), order: Number(inputs.order.value || 0) }
        if (definition.parent) body[definition.parent.field] = inputs[definition.parent.field].value.trim()
        for (const extra of definition.extras) {
          const value = readInput(inputs[extra.field], { ...extra, nullable: false })
          if (value !== undefined) body[extra.field] = value
        }
        busy(submit, async () => {
          try {
            await api('POST', `/admin/catalogs/${catalog}`, body)
            ui.notify(`Se agregó "${body.name}".`, { ok: true })
            await load()
          } catch (error) {
            fail(error)
          }
        })
      }
    }, Object.entries(inputs).map(([field, input]) => h('label', {}, labels[field], input)), submit)
  }

  function rowView (row) {
    const definition = CATALOGS[catalog]
    const name = h('input', { type: 'text', value: row.name, 'aria-label': `Nombre de ${row.key}` })
    const order = h('input', { type: 'number', min: '0', value: String(row.order), 'aria-label': `Orden de ${row.key}` })
    const active = h('input', { type: 'checkbox', checked: row.active, 'aria-label': `${row.key} activa` })
    const extras = definition.extras.map((extra) => ({
      extra,
      input: h('input', { type: extra.type, value: row[extra.field] ?? '', 'aria-label': `${extra.label} de ${row.key}`, ...(extra.type === 'number' ? { min: '16', max: '99' } : {}) })
    }))

    const save = h('button', {
      type: 'button',
      class: 'secondary',
      onClick: () => {
        // Solo lo que cambió.
        const changes = {}
        if (name.value.trim() !== row.name) changes.name = name.value.trim()
        if (Number(order.value) !== row.order) changes.order = Number(order.value)
        if (active.checked !== row.active) changes.active = active.checked
        for (const { extra, input } of extras) {
          const value = readInput(input, extra)
          if (value !== undefined && value !== (row[extra.field] ?? null)) changes[extra.field] = value
        }
        if (Object.keys(changes).length === 0) return ui.notify('No hay cambios para guardar.', { ok: true })
        busy(save, async () => {
          try {
            await api('PATCH', `/admin/catalogs/${catalog}/${row.id}`, changes)
            ui.notify(`Se guardó "${changes.name ?? row.name}".`, { ok: true })
            await load()
          } catch (error) {
            fail(error)
          }
        })
      }
    }, 'Guardar')

    return h('tr', { class: row.active ? '' : 'inactive' },
      h('td', {}, h('code', {}, row.key)),
      definition.parent && h('td', {}, h('code', {}, row[definition.parent.field])),
      h('td', {}, name),
      h('td', {}, order),
      extras.map(({ input }) => h('td', {}, input)),
      h('td', {}, active),
      h('td', {}, save)
    )
  }

  function draw () {
    const definition = CATALOGS[catalog]
    const tbody = h('tbody')
    const count = h('span', { class: 'muted' })

    // Filtrar solo vuelve a dibujar las filas: el buscador conserva el foco y lo escrito.
    function drawRows () {
      const term = filter.toLowerCase()
      const visible = term ? rows.filter((row) => row.name.toLowerCase().includes(term) || row.key.includes(term)) : rows
      render(tbody, visible.map(rowView))
      count.textContent = `${visible.length} de ${rows.length}`
    }

    const select = h('select', {
      'aria-label': 'Catálogo',
      onChange: (event) => { catalog = event.target.value; filter = ''; load().catch(fail) }
    }, Object.entries(CATALOGS).map(([key, { label }]) => h('option', { value: key, selected: key === catalog }, label)))

    const search = h('input', {
      type: 'search',
      placeholder: 'Buscar por nombre o key',
      'aria-label': 'Buscar por nombre o key',
      value: filter,
      onInput: (event) => { filter = event.target.value; drawRows() }
    })

    render(container,
      h('h1', {}, 'Catálogos'),
      h('p', { class: 'muted' }, 'Los cambios se ven en la app en menos de un minuto. Desactivar una opción no se la quita a quien ya la eligió.'),
      h('div', { class: 'toolbar' }, select, search, h('span', { class: 'spacer' }), count),
      h('h2', {}, `Nueva opción en ${definition.label.toLowerCase()}`),
      newRowForm(),
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Key'),
            definition.parent && h('th', {}, definition.parent.label),
            h('th', {}, 'Nombre'),
            h('th', {}, 'Orden'),
            definition.extras.map((extra) => h('th', {}, extra.label)),
            h('th', {}, 'Activa'),
            h('th', {}, '')
          )),
          tbody
        )
      )
    )
    drawRows()
  }

  return load()
}
