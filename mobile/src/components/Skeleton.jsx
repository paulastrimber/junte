import { useEffect, useState } from 'react'
import { Animated, Easing, View } from 'react-native'

import { borders, createThemedStyles, motion, radius, spacing, typography, useReducedMotion } from '../theme/index.js'

// Alto de un `Badge`: su renglón más el relleno de arriba y de abajo.
const BADGE_HEIGHT = typography.micro.lineHeight + spacing.sm

// Pulso: la opacidad baja hasta PULSE_MIN y vuelve, con ease-in-out en cada mitad. Es UNA animación lineal de 0 a 1
// en loop, así corre entera en el hilo nativo (un `Animated.sequence` en loop vuelve al hilo JS en cada tramo, que
// justo está ocupado mientras carga). La interpolación nativa no admite `easing`: la curva se arma con varios puntos.
const PULSE_MIN = 0.45
const REDUCED_OPACITY = 0.6
const PULSE_STEPS = 8
const easeInOut = Easing.inOut(Easing.ease)
const PULSE_INPUT = Array.from({ length: PULSE_STEPS * 2 + 1 }, (_, index) => index / (PULSE_STEPS * 2))
const PULSE_OUTPUT = PULSE_INPUT.map((t) => 1 - (1 - PULSE_MIN) * easeInOut(t <= 0.5 ? t * 2 : (1 - t) * 2))

/**
 * Bloque gris que ocupa el lugar de un contenido mientras carga. Es decorativo: el anuncio "cargando" lo hace
 * quien lo agrupa (`PlanCardSkeleton` o la pantalla), con un `accessibilityLabel`.
 * @param {object} props
 * @param {number | `${number}%`} [props.width]
 * @param {number} [props.height]
 * @param {number} [props.radius]  Por defecto `radius.sm`; `radius.pill` para líneas de texto o círculos.
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 */
export function Skeleton (props) {
  return <SkeletonBlock {...props} opacity={usePulse()} />
}

// El bloque sin animación propia: `PlanCardSkeleton` le pasa un único pulso compartido por todos sus bloques.
function SkeletonBlock ({ width = '100%', height = spacing.lg, radius: corner = radius.sm, style, opacity }) {
  const styles = useStyles()
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
  // Un solo pulso (y una sola consulta de "reducir movimiento") para todos los bloques: laten juntos.
  const opacity = usePulse()
  return (
    <View accessible accessibilityRole='progressbar' accessibilityLabel={label} accessibilityState={{ busy: true }} style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.card}>
          {/* Las alturas copian las de los textos de la tarjeta: título, dos renglones y las etiquetas. */}
          <SkeletonBlock width='75%' height={typography.heading.fontSize} opacity={opacity} />
          <SkeletonBlock width='55%' height={typography.label.fontSize} opacity={opacity} />
          <SkeletonBlock width='40%' height={typography.label.fontSize} opacity={opacity} />
          <View style={styles.footer}>
            <SkeletonBlock width='22%' height={BADGE_HEIGHT} radius={radius.pill} opacity={opacity} />
            <SkeletonBlock width='34%' height={BADGE_HEIGHT} radius={radius.pill} opacity={opacity} />
          </View>
        </View>
      ))}
    </View>
  )
}

// Opacidad que va y viene despacio (`motion.slow` para bajar y otro tanto para subir). Con "reducir movimiento" queda
// quieta a media opacidad.
function usePulse () {
  const isReduced = useReducedMotion()
  const [progress] = useState(() => new Animated.Value(0))
  const [opacity] = useState(() => progress.interpolate({ inputRange: PULSE_INPUT, outputRange: PULSE_OUTPUT }))
  useEffect(() => {
    if (isReduced) return undefined
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: motion.slow * 2, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => {
      loop.stop()
      progress.setValue(0)
    }
  }, [isReduced, progress])
  return isReduced ? REDUCED_OPACITY : opacity
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
