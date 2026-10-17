import { useState } from 'react'
import { Image, View } from 'react-native'

import { createThemedStyles, fonts, sizes } from '../theme/index.js'
import { isSameSignedFile } from '../utils/url.js'
import { Text } from './Text.jsx'

// El back firma la URL de la foto otra vez en cada respuesta. Si la nueva apunta al mismo archivo se sigue usando la
// que ya se cargó: `Image` cachea por URL completa y, con otra firma, la volvería a descargar y parpadearía. Si esa
// carga falló (por ejemplo, venció la firma) se pasa a la más reciente.
function useStablePhotoUri (photoUrl) {
  const [shown, setShown] = useState({ uri: photoUrl ?? null, hasFailed: false })
  const latest = photoUrl ?? null
  if (shown.uri !== latest && (!isSameSignedFile(shown.uri, latest) || shown.hasFailed)) {
    setShown({ uri: latest, hasFailed: false })
  }
  const handleError = () => setShown((current) => (current.hasFailed ? current : { ...current, hasFailed: true }))
  return { uri: shown.uri, handleError }
}

/**
 * Foto de perfil (URL firmada de lectura) o la inicial si todavía no hay foto.
 * @param {object} props
 * @param {string | null} [props.photoUrl]
 * @param {string | null} [props.name]
 * @param {number} [props.size]  Diámetro: `sizes.avatarSm` (chat), `avatarMd` (listas) o `avatarLg` (perfil).
 * @param {string} [props.accessibilityLabel]  Por defecto "Foto de perfil" / "Sin foto de perfil".
 * @param {boolean} [props.decorative]  El lector de pantalla la saltea: para cuando el nombre ya está escrito al lado.
 */
export function Avatar ({ photoUrl, name, size = sizes.avatarLg, accessibilityLabel, decorative = false }) {
  const styles = useStyles()
  const photo = useStablePhotoUri(photoUrl)
  const circle = { width: size, height: size, borderRadius: size / 2 }
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
    : { accessible: true, accessibilityRole: 'image' }
  if (photo.uri) {
    return <Image {...a11y} accessibilityLabel={decorative ? undefined : accessibilityLabel ?? 'Foto de perfil'} source={{ uri: photo.uri }} onError={photo.handleError} style={[styles.image, circle]} />
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

const useStyles = createThemedStyles(({ colors }) => ({
  image: { backgroundColor: colors.surfaceAlt },
  // Violeta suave con la inicial en violeta: menos peso que un círculo lleno, que competía con el botón principal.
  placeholder: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.extrabold }
}))
