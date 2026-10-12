import { Notice } from './Notice.jsx'
import { Text } from './Text.jsx'

/** Error general de un formulario o pantalla (no atado a un campo). */
export function ErrorBanner ({ message, requestId }) {
  if (!message) return null
  return (
    <Notice tone='danger' message={message} accessibilityRole='alert'>
      {/* El requestId sirve para rastrear la falla en los logs; solo se muestra en desarrollo. */}
      {__DEV__ && requestId ? <Text variant='caption' color='textMuted' selectable>requestId: {requestId}</Text> : null}
    </Notice>
  )
}
