import { Image, StyleSheet, Text, View } from 'react-native'

const SIZE = 96

/** Foto de perfil (URL firmada de lectura) o las iniciales si todavía no hay foto. */
export function Avatar ({ photoUrl, name }) {
  if (photoUrl) {
    return <Image accessibilityLabel='Foto de perfil' source={{ uri: photoUrl }} style={styles.image} />
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <View style={styles.placeholder} accessibilityLabel='Sin foto de perfil'>
      <Text style={styles.initial}>{initial}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: '#eee' },
  placeholder: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: '#dbe4ff', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 40, fontWeight: '600', color: '#1f4fd1' }
})
