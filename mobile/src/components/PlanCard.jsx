import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * Tarjeta de un plan en el feed. Presentacional: recibe los textos ya armados (no el objeto `plan`).
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
 * @param {(id: string) => void} props.onPress
 */
export const PlanCard = memo(function PlanCard ({ id, title, schedule, place, distance, price, spots, isFull = false, onPress }) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${title}. ${schedule}. ${place}. ${price}. ${spots}`}
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.line}>{schedule}</Text>
      <Text style={styles.line} numberOfLines={1}>{distance ? `${place} · ${distance}` : place}</Text>
      <View style={styles.footer}>
        <Text style={styles.price}>{price}</Text>
        <Text style={[styles.spots, isFull && styles.full]}>{spots}</Text>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', gap: 4 },
  pressed: { opacity: 0.7 },
  title: { fontSize: 17, fontWeight: '700', color: '#222' },
  line: { fontSize: 14, color: '#444' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  price: { fontSize: 14, fontWeight: '600', color: '#1f4fd1' },
  spots: { fontSize: 13, color: '#1b7f3b' },
  full: { color: '#b42318', fontWeight: '600' }
})
