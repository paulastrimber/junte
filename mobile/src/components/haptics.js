import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'

// Vibraciones cortas como respuesta a un toque. Solo en iOS: en Android la respuesta es la onda (`android_ripple`)
// y la vibración de sistema ya la maneja cada control nativo. Nunca hacen fallar a quien las llama.

function run (feedback) {
  if (Platform.OS !== 'ios') return
  // `Promise.resolve` + `try`: aunque el módulo nativo falle o no devuelva una promesa, el toque sigue su curso.
  try {
    Promise.resolve(feedback()).catch(() => {})
  } catch {}
}

/** Elegir una opción (chip, segmento, interés). */
export function selectionFeedback () {
  run(() => Haptics.selectionAsync())
}

/** Acción principal confirmada por el usuario (inscribirse, enviar). */
export function tapFeedback () {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
}

/** Algo salió bien después de esperar (asistencia registrada, plan creado). */
export function successFeedback () {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
}
