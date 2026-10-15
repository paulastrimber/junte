// Ayudas para armar el DOM. Todo el contenido que viene de la API (textos de usuarios, nombres, descripciones) se
// inserta como TEXTO (`textContent`), nunca como HTML: así un mensaje reportado no puede ejecutar nada en el panel.

/**
 * Crea un elemento. `props` admite atributos, `class`, `dataset`, `on<Evento>` y propiedades como `value`/`checked`.
 * Los hijos pueden ser nodos, strings (se insertan como texto), null/false (se ignoran) o listas.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h (tag, props = {}, ...children) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue
    if (name === 'class') element.className = value
    else if (name === 'dataset') Object.assign(element.dataset, value)
    else if (name.startsWith('on') && typeof value === 'function') element.addEventListener(name.slice(2).toLowerCase(), value)
    else if (name in element && typeof value !== 'string') element[name] = value
    else element.setAttribute(name, value === true ? '' : String(value))
  }
  append(element, children)
  return element
}

function append (parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
}

/** Reemplaza todo el contenido de un elemento. */
export function render (parent, ...children) {
  parent.replaceChildren()
  append(parent, children)
}

const dateFormat = new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Montevideo' })

/** @param {string | null} iso */
export const formatDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : '—')

/**
 * Deshabilita un botón mientras corre la acción (evita doble envío) y lo vuelve a habilitar al terminar.
 * @param {HTMLButtonElement} button
 * @param {() => Promise<void>} action
 */
export async function busy (button, action) {
  if (button.disabled) return
  button.disabled = true
  try {
    await action()
  } finally {
    button.disabled = false
  }
}
