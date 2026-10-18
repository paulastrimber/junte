import { useContext } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'

import { borders, createThemedStyles, spacing } from '../theme/index.js'

/**
 * Contenedor de pantallas con formularios: scroll y teclado que no tapa los campos.
 * @param {object} props
 * @param {boolean} [props.safeTop]  Para pantallas SIN encabezado de navegación: deja libre la barra de estado.
 * @param {import('react').ReactNode} [props.footer]  Acciones fijas abajo, fuera del scroll ("Crear plan",
 *   "Siguiente"): siempre a mano aunque el formulario sea largo. Respeta el área segura de abajo.
 * @param {import('react').Ref<import('react-native').ScrollView>} [props.scrollRef]  Para scrollear desde la pantalla
 *   (llevar la vista al primer error).
 * @param {(event: object) => void} [props.onScroll]  Posición del scroll.
 * @param {(event: object) => void} [props.onLayout]  Alto visible del scroll (en iOS ya descuenta el teclado).
 */
export function Screen ({ children, safeTop = false, footer, scrollRef, onScroll, onLayout }) {
  const styles = useStyles()
  // Fuera de un navegador (tests de una pantalla suelta) no hay proveedor de áreas seguras.
  const insets = useContext(SafeAreaInsetsContext)
  const paddingTop = spacing.xl + (safeTop ? insets?.top ?? 0 : 0)
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={onScroll ? 16 : undefined}
        onLayout={onLayout}
        contentContainerStyle={[styles.content, { paddingTop }]}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='interactive'
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: spacing.md + (insets?.bottom ?? 0) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: borders.thin,
    borderTopColor: colors.border,
    backgroundColor: colors.surface
  }
}))
