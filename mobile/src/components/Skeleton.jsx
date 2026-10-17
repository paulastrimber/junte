import { useEffect, useState } from 'react'
import { Animated, View } from 'react-native'

import { borders, createThemedStyles, motion, radius, spacing, typography, useReducedMotion } from '../theme/index.js'

// Alto de un `Badge`: su renglón más el relleno de arriba y de abajo.
const BADGE_HEIGHT = typography.micro.lineHeight + spacing.sm

/**
 * Bloque gris que ocupa el lugar de un contenido mientras carga. Es decorativo: el anuncio "cargando" lo hace
 * quien lo agrupa (`PlanCardSkeleton` o la pantalla), con un `accessibilityLabel`.
 * @param {object} props
 * @param {number | `${number}%`} [props.width]
 * @param {number} [props.height]
 * @param {number} [props.radius]  Por defecto `radius.sm`; `radius.pill` para líneas de texto o círculos.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 */
export function Skeleton ({ width = '100%', height = spacing.lg, radius: corner = radius.sm, style }) {
  const styles = useStyles()
  const opacity = usePulse()
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility='no-hide-descendants'
      style={[styles.block, { width, height, borderRadius: corner, opacity }, style]}
    />
  )
}

/**
 * Lo que se ve mientras carga una lista de planes: tarjetas con la misma forma que `PlanCard`, para que al llegar
 * los datos no salte nada.
 * @param {object} props
 * @param {string} props.label  "Buscando planes…". Es lo que anuncia el lector de pantalla.
 * @param {number} [props.count]
 */
export function PlanCardSkeleton ({ label, count = 3 }) {
  const styles = useStyles()
  return (
    <View accessible accessibilityRole='progressbar' accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.card}>
          {/* Las alturas copian las de los textos de la tarjeta: título, dos renglones y las etiquetas. */}
          <Skeleton width='75%' height={typography.heading.fontSize} />
          <Skeleton width='55%' height={typography.label.fontSize} />
          <Skeleton width='40%' height={typography.label.fontSize} />
          <View style={styles.footer}>
            <Skeleton width='22%' height={BADGE_HEIGHT} radius={radius.pill} />
            <Skeleton width='34%' height={BADGE_HEIGHT} radius={radius.pill} />
          </View>
        </View>
      ))}
    </View>
  )
}

// Opacidad que va y viene despacio. Con "reducir movimiento" queda quieta a media opacidad.
function usePulse () {
  const isReduced = useReducedMotion()
  const [value] = useState(() => new Animated.Value(1))
  useEffect(() => {
    if (isReduced) {
      value.setValue(0.6)
      return undefined
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 0.45, duration: motion.slow, useNativeDriver: true }),
      Animated.timing(value, { toValue: 1, duration: motion.slow, useNativeDriver: true })
    ]))
    loop.start()
    return () => loop.stop()
  }, [isReduced, value])
  return value
}

const useStyles = createThemedStyles(({ colors }) => ({
  block: { backgroundColor: colors.surfaceAlt },
  list: { gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    borderWidth: borders.thin,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }
}))
