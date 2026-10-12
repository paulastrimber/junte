import { DarkTheme, DefaultTheme } from '@react-navigation/native'

import { palettes } from './colors.js'
import { fonts } from './typography.js'

const navigationFonts = Object.freeze({
  regular: { fontFamily: fonts.regular, fontWeight: 'normal' },
  medium: { fontFamily: fonts.medium, fontWeight: 'normal' },
  bold: { fontFamily: fonts.bold, fontWeight: 'normal' },
  heavy: { fontFamily: fonts.extrabold, fontWeight: 'normal' }
})

/** Tema de React Navigation (encabezados, tabs, fondo de las pantallas) armado con la paleta de la app. */
export function navigationTheme (scheme) {
  const colors = palettes[scheme]
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger
    },
    fonts: navigationFonts
  }
}

/** Opciones comunes de todos los stacks: encabezado nativo, sin línea ni sombra, con la tipografía de la app. */
export function stackScreenOptions (colors) {
  return {
    headerShadowVisible: false,
    headerTintColor: colors.primary,
    headerStyle: { backgroundColor: colors.background },
    headerTitleStyle: { fontFamily: fonts.bold, color: colors.text },
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.background }
  }
}

/** Opciones comunes de la barra de tabs (ícono arriba, texto debajo). */
export function tabScreenOptions (colors) {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border }
  }
}
