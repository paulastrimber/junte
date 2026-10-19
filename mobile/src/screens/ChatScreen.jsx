import { memo, useCallback, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { tapFeedback } from '../components/haptics.js'
import { Icon } from '../components/Icon.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { Text } from '../components/Text.jsx'
import { CHAT_STATUS, POLL_INTERVAL_MS, useChat } from '../hooks/useChat.js'
import { useAuth } from '../hooks/useAuth.js'
import { useScreenFocus } from '../hooks/useScreenFocus.js'
import { MAX_MESSAGE_LENGTH, MESSAGE_STATUS, formatMessageTime, messageGroupPosition } from '../utils/chat.js'
import { borders, createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Chat del plan',
  loading: 'Cargando el chat…',
  errorTitle: 'No pudimos cargar el chat',
  retry: 'Reintentar',
  emptyTitle: 'Todavía no hay mensajes',
  emptyMessage: 'Escribí el primero para arrancar la conversación.',
  list: 'Mensajes del chat',
  inputLabel: 'Mensaje',
  inputPlaceholder: 'Escribí un mensaje',
  send: 'Enviar',
  sending: 'Enviando…',
  notSent: 'No se envió',
  retrySend: 'Reintentar',
  unsupported: 'Actualizá la app para ver este mensaje',
  /** Quién escribió, en el nombre accesible de los mensajes propios. */
  me: 'Vos',
  loadingOlder: 'Cargando mensajes anteriores…',
  loadOlderError: 'No pudimos cargar los mensajes anteriores.',
  polling: `Sin conexión en tiempo real: actualizamos cada ${POLL_INTERVAL_MS / 1000} s`
})

// El contador aparece cerca del límite, no en cada mensaje.
const COUNTER_FROM = 1800
// El campo crece con el texto hasta unas 5 líneas; después scrollea adentro.
const INPUT_MAX_HEIGHT = typography.body.lineHeight * 5 + spacing.md * 2

const keyOf = (message) => message.clientId ?? message.id

/**
 * Una burbuja: propia a la derecha, ajena a la izquierda. Presentacional. Los mensajes seguidos de la misma persona
 * van agrupados: en los ajenos el nombre va solo en el primero del grupo (`isFirst`) y la foto solo en el último
 * (`isLast`); la esquina chica de la burbuja ("cola"), también solo en el último.
 */
const MessageRow = memo(function MessageRow ({ message, isOwn, isFirst, isLast, onRetry }) {
  const styles = useStyles()
  const isPending = message.status === MESSAGE_STATUS.PENDING
  const isFailed = message.status === MESSAGE_STATUS.FAILED
  // Por qué no se envió: `useChat` ya lo deja listo para pintar (ViewError con los textos del chat).
  const sendError = message.error
  const bodyColor = isOwn ? 'onPrimary' : 'text'
  const metaColor = isOwn ? 'onPrimary' : 'textMuted'
  const name = message.sender?.name ?? ''
  // Tipos que esta versión no sabe mostrar (p. ej. notas de voz) no rompen la lista.
  const isText = !message.type || message.type === 'text'
  const status = isPending ? TEXTS.sending : formatMessageTime(message.createdAt)
  // Se anuncia completo aunque el nombre no se vea (no es el primero del grupo): "Ana: hola. 14:32".
  const label = `${isOwn ? TEXTS.me : name}: ${isText ? message.text : TEXTS.unsupported}. ${isFailed ? TEXTS.notSent : status}`

  return (
    <View style={[styles.row, isOwn && styles.rowOwn, isFirst ? styles.groupStart : styles.groupNext]}>
      {/* El nombre va en el nombre accesible de la burbuja: la foto es decorativa para el lector de pantalla. Los
          mensajes sin foto dejan su lugar vacío para que las burbujas del grupo queden alineadas. */}
      {isOwn
        ? null
        : isLast
          ? <Avatar photoUrl={message.sender?.photoUrl} name={message.sender?.name} size={sizes.avatarSm} recyclingKey={keyOf(message)} decorative />
          : <View style={styles.avatarSpace} />}
      <View style={styles.column}>
        <View
          accessible
          accessibilityLabel={label}
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            isLast && (isOwn ? styles.tailOwn : styles.tailOther),
            isPending && styles.pending,
            isFailed && styles.bubbleFailed
          ]}
        >
          {isOwn || !isFirst ? null : <Text variant='label' color='primary'>{name}</Text>}
          {isText
            ? <Text color={bodyColor} selectable>{message.text}</Text>
            : <Text color={metaColor} variant='caption'>{TEXTS.unsupported}</Text>}
          <Text variant='caption' color={metaColor} style={styles.time}>{status}</Text>
        </View>
        {isFailed
          ? (
            <View style={[styles.failed, isOwn && styles.failedOwn]}>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={`${TEXTS.notSent}. ${TEXTS.retrySend}`}
                hitSlop={spacing.sm}
                onPress={() => onRetry(message.clientId)}
                style={styles.retry}
              >
                <Icon name='refresh-outline' size={sizes.iconSm} color='danger' />
                <Text variant='caption' color='danger'>{`${TEXTS.notSent} · ${TEXTS.retrySend}`}</Text>
              </Pressable>
              <Text variant='caption' color='textMuted'>{sendError?.message}</Text>
            </View>
            )
          : null}
      </View>
    </View>
  )
})

/** Caja de texto + botón de enviar. El texto es estado local: lo único que sale es lo que se manda. */
function Composer ({ onSend }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [text, setText] = useState('')
  // Cambia después de cada envío: el campo se vuelve a crear. En iOS, con una autocorrección pendiente, vaciar el
  // campo no alcanza: el teclado vuelve a escribir el texto corregido después (y se reenviaría sin querer). La
  // sugerencia queda en el campo viejo y el nuevo arranca vacío y con el foco.
  const [inputKey, setInputKey] = useState(0)
  const canSend = text.trim().length > 0

  function submit () {
    if (!canSend) return
    tapFeedback()
    onSend(text)
    setText('')
    setInputKey((key) => key + 1)
  }

  return (
    <View style={styles.composer}>
      {text.length >= COUNTER_FROM
        ? <Text variant='caption' color={text.length >= MAX_MESSAGE_LENGTH ? 'danger' : 'textMuted'} style={styles.counter}>{`${text.length}/${MAX_MESSAGE_LENGTH}`}</Text>
        : null}
      <View style={styles.composerRow}>
        <TextInput
          key={inputKey}
          autoFocus={inputKey > 0}
          accessibilityLabel={TEXTS.inputLabel}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={TEXTS.inputPlaceholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          maxLength={MAX_MESSAGE_LENGTH}
          multiline
        />
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={TEXTS.send}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submit}
          style={({ pressed }) => [styles.sendButton, pressed && styles.pressed, !canSend && styles.disabled]}
        >
          <Icon name='send' color='onPrimary' />
        </Pressable>
      </View>
    </View>
  )
}

export default function ChatScreen ({ navigation, route }) {
  const { planId } = route.params
  const styles = useStyles()
  const { colors } = useTheme()
  const { user } = useAuth()
  // Pantalla activa: solo entonces se hace polling.
  const isFocused = useScreenFocus(navigation)
  const chat = useChat(planId, { user, isActive: isFocused })
  const { loadOlder, retrySend, send, reload } = chat
  const userId = user?.id

  // El teclado no tapa el campo: se mide a qué altura de la ventana empieza la pantalla (debajo del encabezado).
  const containerRef = useRef(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const measure = useCallback(() => {
    containerRef.current?.measureInWindow?.((_x, y) => setKeyboardOffset(y))
  }, [])

  // `messages` va del más nuevo al más viejo (lista invertida): `messageGroupPosition` mira los vecinos en ese orden.
  const messages = chat.messages
  const renderMessage = useCallback(({ item, index }) => {
    const { isFirst, isLast } = messageGroupPosition(messages, index)
    return <MessageRow message={item} isOwn={item.sender?.id === userId} isFirst={isFirst} isLast={isLast} onRetry={retrySend} />
  }, [messages, userId, retrySend])

  function olderFooter () {
    if (chat.isLoadingOlder) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator accessibilityLabel={TEXTS.loadingOlder} color={colors.primary} />
        </View>
      )
    }
    if (chat.loadOlderError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner title={TEXTS.loadOlderError} error={chat.loadOlderError} />
          <Button title={TEXTS.retry} variant='secondary' size='sm' onPress={loadOlder} />
        </View>
      )
    }
    return null
  }

  function body () {
    if (chat.status === CHAT_STATUS.LOADING) return <LoadingState label={TEXTS.loading} fill />
    if (chat.status === CHAT_STATUS.ERROR) return <ErrorState title={TEXTS.errorTitle} error={chat.error} onRetry={reload} retryTitle={TEXTS.retry} fill />
    return (
      <>
        {chat.isPolling ? <View style={styles.banner}><Notice tone='warning' icon='cloud-offline-outline' message={TEXTS.polling} accessibilityLiveRegion='polite' /></View> : null}
        {chat.messages.length === 0
          // Una lista invertida también da vuelta su "vacío": por eso va aparte.
          ? <View style={styles.empty}><EmptyState icon='chatbubbles-outline' title={TEXTS.emptyTitle} message={TEXTS.emptyMessage} /></View>
          : (
            <FlatList
              testID='chat-list'
              accessibilityLabel={TEXTS.list}
              inverted
              data={chat.messages}
              keyExtractor={keyOf}
              renderItem={renderMessage}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps='handled'
              keyboardDismissMode='interactive'
              onEndReached={loadOlder}
              onEndReachedThreshold={0.5}
              ListFooterComponent={olderFooter()}
            />
            )}
        <Composer onSend={send} />
      </>
    )
  }

  return (
    <View ref={containerRef} onLayout={measure} style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior='padding' keyboardVerticalOffset={keyboardOffset}>
        {body()}
      </KeyboardAvoidingView>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  empty: { flex: 1, justifyContent: 'center' },
  banner: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footer: { paddingVertical: spacing.md, gap: spacing.sm },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingRight: spacing.xxxl },
  rowOwn: { justifyContent: 'flex-end', paddingRight: 0, paddingLeft: spacing.xxxl },
  // Cada celda de la lista invertida se da vuelta otra vez: adentro, arriba es arriba.
  groupStart: { marginTop: spacing.md },
  groupNext: { marginTop: spacing.xxs },
  avatarSpace: { width: sizes.avatarSm },
  column: { flexShrink: 1, gap: spacing.xs },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', gap: spacing.xxs },
  bubbleOwn: { backgroundColor: colors.primary },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: borders.thin, borderColor: colors.border },
  tailOwn: { borderBottomRightRadius: radius.sm },
  tailOther: { borderBottomLeftRadius: radius.sm },
  bubbleFailed: { borderWidth: borders.thick, borderColor: colors.danger },
  pending: { opacity: 0.6 },
  time: { alignSelf: 'flex-end' },
  failed: { gap: spacing.xxs },
  failedOwn: { alignItems: 'flex-end' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touchSmall },

  composer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs, borderTopWidth: borders.thin, borderTopColor: colors.border, backgroundColor: colors.surface },
  counter: { alignSelf: 'flex-end' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: sizes.input,
    maxHeight: INPUT_MAX_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: borders.thick,
    // Borde de control (3:1), como el de `FormField`: el campo se tiene que ver aunque esté vacío.
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    color: colors.text
  },
  sendButton: { width: sizes.input, height: sizes.input, borderRadius: radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 }
}))
