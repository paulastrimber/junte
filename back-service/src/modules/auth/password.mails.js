// Textos de los emails de contraseña. Funciones puras: devuelven el asunto y el cuerpo (texto y HTML).
// El nombre lo escribe la persona: en el HTML siempre va escapado.

const ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char])

const greeting = (name) => (name ? `Hola ${name}:` : 'Hola:')

const page = (paragraphs) => `<!doctype html><html lang="es"><body style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c1530;line-height:1.5">${paragraphs.join('')}<p style="color:#6b6480;font-size:13px">junte</p></body></html>`

/**
 * Email con el código para elegir una contraseña nueva.
 * @param {{ name?: string, code: string, minutes: number }} params
 * @returns {{ subject: string, text: string, html: string }}
 */
export function resetCodeMail ({ name, code, minutes }) {
  const lines = [
    greeting(name),
    `Tu código para elegir una contraseña nueva en junte es ${code}.`,
    `Vence en ${minutes} minutos y sirve una sola vez.`,
    'Si no lo pediste vos, no hagas nada: tu contraseña sigue siendo la misma. No compartas este código con nadie.'
  ]
  return {
    subject: 'Tu código para cambiar la contraseña de junte',
    text: lines.join('\n\n'),
    html: page([
      `<p>${escapeHtml(greeting(name))}</p>`,
      '<p>Tu código para elegir una contraseña nueva en junte es:</p>',
      `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${escapeHtml(code)}</p>`,
      `<p>Vence en ${escapeHtml(minutes)} minutos y sirve una sola vez.</p>`,
      '<p>Si no lo pediste vos, no hagas nada: tu contraseña sigue siendo la misma. No compartas este código con nadie.</p>'
    ])
  }
}

/**
 * Aviso de que la contraseña cambió (por recuperación o desde el perfil).
 * @param {{ name?: string }} params
 * @returns {{ subject: string, text: string, html: string }}
 */
export function passwordChangedMail ({ name }) {
  const lines = [
    greeting(name),
    'La contraseña de tu cuenta de junte se cambió recién.',
    'Si fuiste vos, no tenés que hacer nada. Si no fuiste vos, abrí la app, tocá "¿Olvidaste tu contraseña?" y elegí una nueva: eso cierra la sesión en todos los dispositivos.'
  ]
  return {
    subject: 'Se cambió la contraseña de tu cuenta de junte',
    text: lines.join('\n\n'),
    html: page(lines.map((line) => `<p>${escapeHtml(line)}</p>`))
  }
}
