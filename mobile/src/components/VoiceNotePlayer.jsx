import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useEffect, useRef } from 'react'
import { Pressable, View } from 'react-native'

import { createThemedStyles, sizes, spacing } from '../theme/index.js'
import { setPlaybackAudioMode } from '../utils/audio.js'
import { formatDuration } from '../utils/chat.js'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

export const TEXTS = Object.freeze({
  play: 'Reproducir nota de voz',
  pause: 'Pausar nota de voz',
  label: (duration) => `Nota de voz de ${duration}`
})

/**
 * Reproductor de una nota de voz del chat: play/pausa y la duración. Presentacional; el audio llega como URL firmada
 * (o el archivo local mientras se envía). La URL firmada vence: si el audio no carga se llama a `onExpired` (una vez por
 * intento de reproducción) para que el padre traiga una nueva, y cuando llega se reintenta el play.
 * @param {{ source: string | null, durationMs: number, color?: string, onExpired?: () => void }} props
 */
export function VoiceNotePlayer ({ source, durationMs, color = 'text', onExpired }) {
  const styles = useStyles()
  const player = useAudioPlayer(source ? { uri: source } : null)
  const status = useAudioPlayerStatus(player)
  const isPlaying = Boolean(status?.playing)
  const duration = formatDuration(durationMs)
  const hasRetried = useRef(false)
  const isRetryPending = useRef(false)

  // Falló la carga (URL vencida): se pide una nueva una sola vez; si la segunda también falla, no se insiste.
  const error = status?.error
  useEffect(() => {
    if (!error || !onExpired || hasRetried.current) return
    hasRetried.current = true
    isRetryPending.current = true
    onExpired()
  }, [error, onExpired])

  // Con la URL nueva llega otro reproductor: se reintenta lo que quería el usuario.
  useEffect(() => {
    if (!isRetryPending.current) return
    isRetryPending.current = false
    setPlaybackAudioMode().then(() => player.play()).catch(() => {})
  }, [player])

  useEffect(() => {
    if (isPlaying) hasRetried.current = false
  }, [isPlaying])

  // Al terminar vuelve al principio para poder escucharla otra vez.
  useEffect(() => {
    if (status?.didJustFinish) Promise.resolve(player.seekTo(0)).catch(() => {})
  }, [status?.didJustFinish, player])

  // Antes de cada play se fija el modo de reproducción: si no, en iOS el switch de silencio la deja muda.
  const toggle = () => {
    if (isPlaying) return player.pause()
    setPlaybackAudioMode().then(() => player.play())
  }
  const shown = isPlaying && status?.currentTime ? formatDuration(status.currentTime * 1000) : duration

  return (
    <View style={styles.row} accessible={false}>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={isPlaying ? TEXTS.pause : TEXTS.play}
        accessibilityHint={TEXTS.label(duration)}
        disabled={!source}
        hitSlop={spacing.sm}
        onPress={toggle}
        style={styles.button}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} color={color} size={sizes.iconLg} />
      </Pressable>
      <Icon name='mic-outline' color={color} size={sizes.iconSm} />
      <Text color={color}>{shown}</Text>
    </View>
  )
}

const useStyles = createThemedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 140 },
  button: { minWidth: sizes.touchSmall, minHeight: sizes.touchSmall, alignItems: 'center', justifyContent: 'center' }
}))
