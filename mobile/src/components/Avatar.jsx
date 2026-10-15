import { Image, View } from 'react-native'

import { createThemedStyles, fonts } from '../theme/index.js'
import { Text } from './Text.jsx'

/**
 * Foto de perfil (URL firmada de lectura) o la inicial si todavía no hay foto.
 * @param {object} props
 * @param {string | null} [props.photoUrl]
 * @param {string | null} [props.name]
 * @param {number} [props.size]  Diámetro.
 */
export function Avatar ({ photoUrl, name, size = 96 }) {
  const styles = useStyles()
  const circle = { width: size, height: size, borderRadius: size / 2 }
  if (photoUrl) {
    return <Image accessibilityLabel='Foto de perfil' source={{ uri: photoUrl }} style={[styles.image, circle]} />
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  const fontSize = Math.round(size * 0.42)
  return (
    <View style={[styles.placeholder, circle]} accessibilityLabel='Sin foto de perfil'>
      <Text color='onPrimary' style={[styles.initial, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}>{initial}</Text>
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  image: { backgroundColor: colors.surfaceAlt },
  placeholder: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.extrabold }
}))
