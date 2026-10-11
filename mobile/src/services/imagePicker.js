// Selector de fotos del teléfono (expo-image-picker). Solo imágenes, recorte cuadrado y compresión:
// la foto de perfil se muestra redonda y el back admite hasta 5 MB.
import * as ImagePicker from 'expo-image-picker'

/**
 * @returns {Promise<{ uri: string, mimeType?: string, fileSize?: number } | null>} null si se cancela.
 */
export async function pickProfileImage () {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8
  })
  return result.canceled ? null : result.assets[0]
}
