// Un import por peso (no desde la raíz del paquete): así el binario lleva solo los cinco archivos que se usan.
import { PlusJakartaSans_400Regular as Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular'
import { PlusJakartaSans_500Medium as Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium'
import { PlusJakartaSans_600SemiBold as SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold'
import { PlusJakartaSans_700Bold as Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold'
import { PlusJakartaSans_800ExtraBold as ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold'

/** Archivos de fuente que `App` carga al arrancar (un archivo por peso). */
export const fontAssets = Object.freeze({
  PlusJakartaSans_400Regular: Regular,
  PlusJakartaSans_500Medium: Medium,
  PlusJakartaSans_600SemiBold: SemiBold,
  PlusJakartaSans_700Bold: Bold,
  PlusJakartaSans_800ExtraBold: ExtraBold
})

// El peso se elige con la familia (un archivo por peso): no se usa `fontWeight`, que haría que el sistema
// sintetice la negrita o caiga a la fuente por defecto.
export const fonts = Object.freeze({
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold'
})

/** Escala tipográfica. Las pantallas eligen una variante (`<Text variant='title'>`), no un `fontSize`. */
export const typography = Object.freeze({
  display: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  // Rótulos en mayúsculas ("ORGANIZA", "CUÁNDO").
  overline: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' }
})
