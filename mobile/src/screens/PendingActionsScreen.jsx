import { FlatList, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { Notice } from '../components/Notice.jsx'
import { Text } from '../components/Text.jsx'
import { PLAN_ACTION_MESSAGES } from '../hooks/usePlanActions.js'
import { usePendingActions } from '../hooks/usePendingActions.js'
import { OUTBOX_STATUS } from '../services/offline/index.js'
import { createThemedStyles, radius, spacing } from '../theme/index.js'
import { formatMessageTime } from '../utils/chat.js'
import { CHAT_ERROR_MESSAGES, messageForError } from '../utils/errorMessages.js'

export const TEXTS = Object.freeze({
  title: 'Pendientes',
  offline: 'Sin conexión: se envían solos cuando vuelva.',
  emptyTitle: 'No hay nada pendiente',
  emptyMessage: 'Lo que hagas sin conexión aparece acá hasta que se envíe.',
  status: { pending: 'Pendiente', sending: 'Enviando…', failed: 'No se pudo enviar' },
  retry: 'Reintentar',
  discard: 'Descartar',
  sendNow: 'Enviar ahora',
  describe: {
    join: (title) => `Inscribirte en ${title ? `«${title}»` : 'un plan'}`,
    leave: (title) => `Darte de baja de ${title ? `«${title}»` : 'un plan'}`,
    message: (title) => `Mensaje en el chat de ${title ? `«${title}»` : 'un plan'}`,
    report: (label) => `Reportar ${label ?? 'algo'}`
  }
})

// El mismo `code` dice otra cosa según lo que se intentó hacer.
const ERROR_MESSAGES = Object.freeze({
  join: PLAN_ACTION_MESSAGES.join,
  leave: PLAN_ACTION_MESSAGES.leave,
  message: CHAT_ERROR_MESSAGES,
  report: { NOT_FOUND: 'Lo que querías reportar ya no está disponible.' }
})

function describe (item) {
  const { type, payload } = item
  return type === 'report' ? TEXTS.describe.report(payload.label) : TEXTS.describe[type](payload.planTitle)
}

/** Lista de la cola de pendientes (S6-MOB-02): qué espera, qué falló y por qué. */
export default function PendingActionsScreen () {
  const styles = useStyles()
  const pending = usePendingActions()
  const { discard, retry, sendNow } = pending

  const renderItem = ({ item }) => {
    const failed = item.status === OUTBOX_STATUS.FAILED
    return (
      <View style={styles.card}>
        <Text variant='bodyStrong'>{describe(item)}</Text>
        {item.type === 'message' ? <Text color='textMuted' numberOfLines={2}>{item.payload.text}</Text> : null}
        <Text variant='caption' color={failed ? 'danger' : 'textMuted'}>{`${TEXTS.status[item.status]} · ${formatMessageTime(item.createdAt)}`}</Text>
        {failed ? <Notice tone='danger' message={messageForError(item.error, ERROR_MESSAGES[item.type])} /> : null}
        <View style={styles.actions}>
          {failed ? <Button title={TEXTS.retry} size='sm' variant='secondary' onPress={() => retry(item.id)} /> : null}
          {item.status !== OUTBOX_STATUS.SENDING ? <Button title={TEXTS.discard} size='sm' variant='ghost' onPress={() => discard(item.id)} /> : null}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={pending.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={pending.isOnline
          ? (pending.items.some((item) => item.status === OUTBOX_STATUS.PENDING) ? <Button title={TEXTS.sendNow} variant='secondary' onPress={sendNow} /> : null)
          : <Notice tone='warning' icon='cloud-offline-outline' message={TEXTS.offline} />}
        ListEmptyComponent={<EmptyState icon='checkmark-done-outline' title={TEXTS.emptyTitle} message={TEXTS.emptyMessage} />}
      />
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.xs, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }
}))
