import { Image } from 'expo-image'
import { useState } from 'react'
import { View } from 'react-native'

import { createThemedStyles, fonts, motion, sizes } from '../theme/index.js'
import { withoutSignature } from '../utils/url.js'
import { Text } from './Text.jsx'

/**
 * Foto de perfil (URL firmada de lectura) o la inicial si todavía no hay foto o no se pudo cargar.
 *
 * El back firma la URL otra vez en cada respuesta: el caché de `expo-image` (memoria y disco) se indexa por la URL
 * sin firma, así que una firma nueva del mismo archivo no se vuelve a descargar ni parpadea, ni siquiera al
 * reabrir la app. Cada foto subida usa otra clave, así que una foto nueva sí se descarga.
 * @param {object} props
 * @param {string | null} [props.photoUrl]
 * @param {string | null} [props.name]
 * @param {number} [props.size]  Diámetro: `sizes.avatarSm` (chat), `avatarMd` (listas) o `avatarLg` (perfil).
 * @param {string} [props.accessibilityLabel]  Por defecto "Foto de perfil" / "Sin foto de perfil".
 * @param {boolean} [props.decorative]  El lector de pantalla la saltea: para cuando el nombre ya está escrito al lado.
 * @param {string} [props.recyclingKey]  En listas: identifica la fila, para no mostrar la foto de otra mientras carga.
 */
export function Avatar ({ photoUrl, name, size = sizes.avatarLg, accessibilityLabel, decorative = false, recyclingKey }) {
  const styles = useStyles()
  // URL completa cuya carga falló: se muestra la inicial hasta que llegue otra (otra foto o una firma nueva).
  const [failedUri, setFailedUri] = useState(null)
  const uri = photoUrl || null
  const circle = { width: size, height: size, borderRadius: size / 2 }
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
    : { accessible: true, accessibilityRole: 'image' }
  if (uri && uri !== failedUri) {
    return (
      <Image
        {...a11y}
        accessibilityLabel={decorative ? undefined : accessibilityLabel ?? 'Foto de perfil'}
        source={{ uri, cacheKey: withoutSignature(uri) }}
        cachePolicy='memory-disk'
        transition={motion.fast}
        recyclingKey={recyclingKey}
        onError={() => setFailedUri(uri)}
        style={[styles.image, circle]}
      />
    )
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  const fontSize = Math.round(size * 0.42)
  return (
    <View style={[styles.placeholder, circle]} {...a11y} accessibilityLabel={decorative ? undefined : accessibilityLabel ?? 'Sin foto de perfil'}>
      {/* La inicial escala con el círculo, no con el texto del sistema: si no, se sale. */}
      <Text color='onPrimarySoft' allowFontScaling={false} style={[styles.initial, { fontSize, lineHeight: Math.round(fontSize * 1.2) }]}>{initial}</Text>
    </View>
  )
}

/**
 * Vacía el caché de fotos (memoria y disco) al cerrar sesión: son fotos de otras personas. Nunca rechaza, para que
 * un fallo del caché no impida cerrar la sesión.
 */
export async function clearPhotoCache () {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()])
}

const useStyles = createThemedStyles(({ colors }) => ({
  image: { backgroundColor: colors.surfaceAlt },
  // Violeta suave con la inicial en violeta: menos peso que un círculo lleno, que competía con el botón principal.
  placeholder: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.extrabold }
}))
