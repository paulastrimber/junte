import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'

import { createThemedStyles, sizes, spacing } from '../theme/index.js'
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
 * (o el archivo local mientras se envía).
 * @param {{ source: string | null, durationMs: number, color?: string }} props
 */
export function VoiceNotePlayer ({ source, durationMs, color = 'text' }) {
  const styles = useStyles()
  const player = useAudioPlayer(source ? { uri: source } : null)
  const status = useAudioPlayerStatus(player)
  const isPlaying = Boolean(status?.playing)
  const duration = formatDuration(durationMs)

  // Al terminar vuelve al principio para poder escucharla otra vez.
  useEffect(() => {
    if (status?.didJustFinish) Promise.resolve(player.seekTo(0)).catch(() => {})
  }, [status?.didJustFinish, player])

  const toggle = () => (isPlaying ? player.pause() : player.play())
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
