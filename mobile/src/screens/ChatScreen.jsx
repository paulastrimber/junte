import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { Icon } from '../components/Icon.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { Text } from '../components/Text.jsx'
import { CHAT_STATUS, POLL_INTERVAL_MS, useChat } from '../hooks/useChat.js'
import { useAuth } from '../hooks/useAuth.js'
import { MAX_MESSAGE_LENGTH, MESSAGE_STATUS, formatMessageTime } from '../utils/chat.js'
import { CHAT_ERROR_MESSAGES, messageForError } from '../utils/errorMessages.js'
import { createThemedStyles, radius, sizes, spacing, typography, useTheme } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Chat del plan',
  loading: 'Cargando el chat…',
  errorTitle: 'No pudimos cargar el chat.',
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
  unsupported: 'Mensaje no compatible con esta versión de la app',
  loadingOlder: 'Cargando mensajes anteriores…',
  loadOlderError: 'No pudimos cargar los mensajes anteriores.',
  polling: `Sin conexión en tiempo real: actualizamos cada ${POLL_INTERVAL_MS / 1000} s`
})

// El contador aparece cerca del límite, no en cada mensaje.
const COUNTER_FROM = 1800

const keyOf = (message) => message.clientId ?? message.id

/** Una burbuja: propia a la derecha, ajena a la izquierda con foto y nombre. Presentacional. */
const MessageRow = memo(function MessageRow ({ message, isOwn, onRetry }) {
  const styles = useStyles()
  const isPending = message.status === MESSAGE_STATUS.PENDING
  const isFailed = message.status === MESSAGE_STATUS.FAILED
  const bodyColor = isOwn ? 'onPrimary' : 'text'
  const metaColor = isOwn ? 'onPrimary' : 'textMuted'
  const name = message.sender?.name ?? ''
  // Tipos que esta versión no sabe mostrar (p. ej. notas de voz) no rompen la lista.
  const isText = !message.type || message.type === 'text'

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {isOwn ? null : <Avatar photoUrl={message.sender?.photoUrl} name={message.sender?.name} size={32} />}
      <View style={styles.column}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, isPending && styles.pending, isFailed && styles.bubbleFailed]}>
          {isOwn ? null : <Text variant='label' color='primary'>{name}</Text>}
          {isText
            ? <Text color={bodyColor} selectable>{message.text}</Text>
            : <Text color={metaColor} variant='caption'>{TEXTS.unsupported}</Text>}
          <Text variant='caption' color={metaColor} style={styles.time}>{isPending ? TEXTS.sending : formatMessageTime(message.createdAt)}</Text>
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
              <Text variant='caption' color='textMuted'>{messageForError(message.error, CHAT_ERROR_MESSAGES)}</Text>
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
  const canSend = text.trim().length > 0

  function submit () {
    if (!canSend) return
    onSend(text)
    setText('')
  }

  return (
    <View style={styles.composer}>
      {text.length >= COUNTER_FROM
        ? <Text variant='caption' color={text.length >= MAX_MESSAGE_LENGTH ? 'danger' : 'textMuted'} style={styles.counter}>{`${text.length}/${MAX_MESSAGE_LENGTH}`}</Text>
        : null}
      <View style={styles.composerRow}>
        <TextInput
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

// Pantalla activa: solo entonces se hace polling (React Navigation avisa con focus / blur).
function useIsFocused (navigation) {
  const [isFocused, setIsFocused] = useState(true)
  useEffect(() => {
    const stopFocus = navigation.addListener('focus', () => setIsFocused(true))
    const stopBlur = navigation.addListener('blur', () => setIsFocused(false))
    return () => {
      stopFocus()
      stopBlur()
    }
  }, [navigation])
  return isFocused
}

export default function ChatScreen ({ navigation, route }) {
  const { planId } = route.params
  const styles = useStyles()
  const { user } = useAuth()
  const isFocused = useIsFocused(navigation)
  const chat = useChat(planId, { user, isActive: isFocused })
  const { loadOlder, retrySend, send, reload } = chat
  const userId = user?.id

  // El teclado no tapa el campo: se mide a qué altura de la ventana empieza la pantalla (debajo del encabezado).
  const containerRef = useRef(null)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const measure = useCallback(() => {
    containerRef.current?.measureInWindow?.((_x, y) => setKeyboardOffset(y))
  }, [])

  const renderMessage = useCallback(({ item }) => (
    <MessageRow message={item} isOwn={item.sender?.id === userId} onRetry={retrySend} />
  ), [userId, retrySend])

  function olderFooter () {
    if (chat.isLoadingOlder) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator accessibilityLabel={TEXTS.loadingOlder} />
        </View>
      )
    }
    if (chat.loadOlderError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner message={`${TEXTS.loadOlderError} ${messageForError(chat.loadOlderError)}`} requestId={chat.loadOlderError.requestId} />
          <Button title={TEXTS.retry} variant='secondary' size='sm' onPress={loadOlder} />
        </View>
      )
    }
    return null
  }

  function body () {
    if (chat.status === CHAT_STATUS.LOADING) return <LoadingState label={TEXTS.loading} fill />
    if (chat.status === CHAT_STATUS.ERROR) {
      return (
        <View style={styles.error}>
          <Text variant='heading' center>{TEXTS.errorTitle}</Text>
          <ErrorBanner message={messageForError(chat.error, CHAT_ERROR_MESSAGES)} requestId={chat.error?.requestId} />
          <Button title={TEXTS.retry} onPress={reload} />
        </View>
      )
    }
    return (
      <>
        {chat.isPolling ? <View style={styles.banner}><Notice tone='warning' message={TEXTS.polling} /></View> : null}
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
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { flex: 1, justifyContent: 'center' },
  error: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  banner: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  footer: { paddingVertical: spacing.md, gap: spacing.sm },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingRight: spacing.xxxl },
  rowOwn: { justifyContent: 'flex-end', paddingRight: 0, paddingLeft: spacing.xxxl },
  column: { flexShrink: 1, gap: spacing.xs },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', gap: 2 },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleOther: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: radius.sm },
  bubbleFailed: { borderWidth: 1.5, borderColor: colors.danger },
  pending: { opacity: 0.6 },
  time: { alignSelf: 'flex-end' },
  failed: { gap: 2 },
  failedOwn: { alignItems: 'flex-end' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touchSmall },

  composer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  counter: { alignSelf: 'flex-end' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: sizes.input,
    maxHeight: 132,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
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
