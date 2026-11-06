import { setAudioModeAsync } from 'expo-audio'

// Modo de audio para escuchar notas de voz. En iOS, expo-audio completa los campos que no se pasan con su valor nativo
// (`playsInSilentMode: false`), y así la sesión queda en `.ambient`: con el switch de silencio puesto no se oye nada.
// Por eso siempre se pasa `playsInSilentMode: true`, también al salir de la grabación.
export const PLAYBACK_AUDIO_MODE = Object.freeze({ allowsRecording: false, playsInSilentMode: true })

/** Deja la sesión de audio lista para reproducir. Nunca rechaza. */
export function setPlaybackAudioMode () {
  return Promise.resolve(setAudioModeAsync(PLAYBACK_AUDIO_MODE)).catch(() => {})
}
