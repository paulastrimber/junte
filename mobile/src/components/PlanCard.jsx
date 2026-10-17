import { memo } from 'react'
import { Pressable, View } from 'react-native'

import { borders, createThemedStyles, motion, radius, sizes, spacing } from '../theme/index.js'
import { Badge } from './Badge.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Tarjeta de un plan en el feed, con forma de entrada: arriba qué, cuándo y dónde; abajo, separado por un corte
 * con muescas, lo que cuesta y si queda lugar. Va sobre `colors.background` (las muescas son de ese color).
 * Presentacional: recibe los textos ya armados (no el objeto `plan`).
 * `memo` + props primitivas: al cargar otra página no se vuelven a pintar las tarjetas que ya estaban.
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.title
 * @param {string} props.schedule  Cuándo es ("sáb 25/10 · 18:00 a 20:00").
 * @param {string} props.place  Nombre del lugar.
 * @param {string} [props.distance]  "a 2,4 km" (solo en el feed por cercanía).
 * @param {string} props.price  "Gratis" o "$ 150".
 * @param {string} props.spots  "Quedan 3 lugares", "Lleno", "Sin límite de cupo".
 * @param {boolean} [props.isFull]
 * @param {boolean} [props.isFree]  El precio va en lima: es lo primero que se busca en un plan.
 * @param {'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger'} [props.spotsTone]  Tono de la
 *   etiqueta del cupo; por defecto `danger` si está lleno y `primary` si no. En "Mis planes" sirve para el estado
 *   ("Asististe" → `success`, "Cancelado" → `danger`).
 * @param {(id: string) => void} props.onPress
 */
export const PlanCard = memo(function PlanCard ({ id, title, schedule, place, distance, price, spots, isFull = false, isFree = false, spotsTone, onPress }) {
  const styles = useStyles()
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${title}. ${schedule}. ${place}. ${price}. ${spots}`}
      accessibilityHint='Abre el detalle del plan'
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.clip}>
        <View style={styles.body}>
          <Text variant='heading' numberOfLines={2}>{title}</Text>
          <View style={styles.line}>
            <Icon name='calendar-outline' size={sizes.iconSm} color='primary' />
            <Text variant='label' style={styles.lineText}>{schedule}</Text>
          </View>
          <View style={styles.line}>
            <Icon name='location-outline' size={sizes.iconSm} color='textMuted' />
            <Text variant='label' color='textMuted' numberOfLines={1} style={styles.lineText}>{distance ? `${place} · ${distance}` : place}</Text>
          </View>
        </View>

        {/* El corte de la entrada: una línea y dos muescas del color del fondo. */}
        <View style={styles.cut}>
          <View style={[styles.notch, styles.notchStart]} />
          <View style={styles.cutLine} />
          <View style={[styles.notch, styles.notchEnd]} />
        </View>

        <View style={styles.footer}>
          <Badge label={price} tone={isFree ? 'accent' : 'neutral'} />
          <Badge label={spots} tone={spotsTone ?? (isFull ? 'danger' : 'primary')} icon={isFull ? 'lock-closed-outline' : undefined} />
        </View>
      </View>
    </Pressable>
  )
})

const NOTCH = spacing.lg

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  // La sombra va afuera y el recorte adentro: `overflow: 'hidden'` cortaría la sombra.
  card: { borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: colors.surface, boxShadow: shadows.card },
  clip: {
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: borders.thin,
    borderColor: shadows.card ? 'transparent' : colors.border
  },
  pressed: { opacity: 0.9, transform: [{ scale: motion.pressScale }] },
  body: { gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineText: { flex: 1 },
  cut: { flexDirection: 'row', alignItems: 'center', height: NOTCH },
  cutLine: { flex: 1, height: borders.thin, marginHorizontal: spacing.xs, backgroundColor: colors.border },
  notch: {
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: colors.background,
    borderWidth: borders.thin,
    borderColor: shadows.card ? 'transparent' : colors.border
  },
  // Media muesca queda afuera de la tarjeta y el recorte la oculta.
  notchStart: { marginLeft: -NOTCH / 2 },
  notchEnd: { marginRight: -NOTCH / 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.md }
}))
