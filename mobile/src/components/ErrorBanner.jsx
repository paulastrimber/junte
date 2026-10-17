import { Notice } from './Notice.jsx'
import { Text } from './Text.jsx'

/**
 * Error general de un formulario, de una acción o de un refresco (no atado a un campo).
 * @param {object} props
 * @param {import('../utils/errorMessages.js').ViewError | null} [props.error]  Lo que expone el hook.
 * @param {string} [props.message]  Texto suelto, si no hay `error` (o para reemplazar el suyo).
 * @param {string | null} [props.requestId]
 * @param {string} [props.title]  Qué falló, en negrita arriba del mensaje ("No pudimos cargar más planes.").
 */
export function ErrorBanner ({ error, message = error?.message, requestId = error?.requestId, title }) {
  if (!message) return null
  return (
    <Notice tone='danger' title={title} message={message} accessibilityRole='alert'>
      {/* El requestId sirve para rastrear la falla en los logs; solo se muestra en desarrollo. */}
      {__DEV__ && requestId ? <Text variant='caption' color='textMuted' selectable>requestId: {requestId}</Text> : null}
    </Notice>
  )
}
