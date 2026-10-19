import { View } from 'react-native'

import { spacing } from '../theme/index.js'
import { formatMessageTime } from '../utils/chat.js'
import { Button } from './Button.jsx'
import { Notice } from './Notice.jsx'

export const OFFLINE_TEXTS = Object.freeze({
  saved: (time) => `Sin conexión. Te mostramos lo último que guardamos (${time}).`,
  offline: 'Sin conexión. Lo que hagas queda pendiente y se envía cuando vuelva.',
  pending: (count) => (count === 1 ? '1 acción pendiente de enviar.' : `${count} acciones pendientes de enviar.`),
  failed: (count) => (count === 1 ? '1 acción pendiente no se pudo enviar.' : `${count} acciones pendientes no se pudieron enviar.`),
  open: 'Ver pendientes'
})

/**
 * Aviso de conexión de una pantalla (S6-MOB-01 y 02): si lo que se ve vino de lo guardado en el teléfono, si no hay
 * conexión, y cuántas acciones esperan en la cola (o fallaron). No muestra nada si todo está al día. Presentacional.
 * @param {object} props
 * @param {string | null} [props.savedAt]  ISO 8601: lo que se ve es lo guardado a esa hora.
 * @param {boolean} props.isOnline
 * @param {number} [props.pendingCount]
 * @param {number} [props.failedCount]
 * @param {() => void} [props.onOpenPending]  Abre la lista de pendientes.
 */
export function OfflineNotice ({ savedAt = null, isOnline, pendingCount = 0, failedCount = 0, onOpenPending }) {
  const parts = []
  if (savedAt) parts.push(OFFLINE_TEXTS.saved(formatMessageTime(savedAt)))
  else if (!isOnline) parts.push(OFFLINE_TEXTS.offline)
  if (pendingCount > 0) parts.push(OFFLINE_TEXTS.pending(pendingCount))
  if (parts.length === 0 && failedCount === 0) return null

  return (
    <View style={{ gap: spacing.sm }}>
      {parts.length > 0 ? <Notice tone={savedAt || !isOnline ? 'warning' : 'info'} icon='cloud-offline-outline' message={parts.join(' ')} /> : null}
      {failedCount > 0
        ? (
          <Notice tone='danger' message={OFFLINE_TEXTS.failed(failedCount)}>
            {onOpenPending ? <Button title={OFFLINE_TEXTS.open} variant='ghost' size='sm' onPress={onOpenPending} style={{ alignSelf: 'flex-start' }} /> : null}
          </Notice>
          )
        : null}
    </View>
  )
}
