import { AudioQuality, IOSOutputFormat, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import { useCallback, useEffect, useRef, useState } from 'react'

import { VOICE_MAX_DURATION_MS } from '../services/voiceNotes.js'
import { setPlaybackAudioMode } from '../utils/audio.js'

// AAC en .m4a en los dos sistemas (lo que acepta el back), mono a 64 kbps: 60 segundos pesan ~0,5 MB.
export const VOICE_RECORDING_OPTIONS = Object.freeze({
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { extension: '.m4a', outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/mp4', bitsPerSecond: 64000 }
})

export const RECORDER_STATUS = Object.freeze({ IDLE: 'idle', STARTING: 'starting', RECORDING: 'recording', DENIED: 'denied', ERROR: 'error' })

const TICK_MS = 250

/**
 * Grabación de una nota de voz (S5-MOB-05). `start` pide el permiso del micrófono la primera vez; `stop` devuelve el
 * archivo y la duración; `cancel` lo descarta. A los 60 segundos se corta sola y avisa por `onLimit` con la nota.
 * Solo se graba con la pantalla abierta (sin grabación en segundo plano).
 * @param {{ onLimit?: (note: { uri: string, durationMs: number }) => void }} [options]
 */
export function useVoiceRecorder ({ onLimit } = {}) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS)
  const [status, setStatus] = useState(RECORDER_STATUS.IDLE)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAtRef = useRef(0)
  const timerRef = useRef(null)
  const isStartingRef = useRef(false)
  const isUnmountedRef = useRef(false)
  const onLimitRef = useRef(onLimit)
  useEffect(() => { onLimitRef.current = onLimit })

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const finish = useCallback(async () => {
    clearTimer()
    const durationMs = Math.min(Date.now() - startedAtRef.current, VOICE_MAX_DURATION_MS)
    try {
      await recorder.stop()
    } finally {
      setPlaybackAudioMode()
      setStatus(RECORDER_STATUS.IDLE)
      setElapsedMs(0)
    }
    return recorder.uri ? { uri: recorder.uri, durationMs: Math.max(1, durationMs) } : null
  }, [recorder])

  const start = useCallback(async () => {
    // Sin doble inicio: ni con la grabación en curso ni mientras se prepara (permiso, modo de audio, grabador).
    if (timerRef.current || isStartingRef.current) return
    isStartingRef.current = true
    setStatus(RECORDER_STATUS.STARTING)
    try {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        setStatus(RECORDER_STATUS.DENIED)
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      // La pantalla se cerró mientras se preparaba: no se graba y se devuelve el modo de audio.
      if (isUnmountedRef.current) {
        setPlaybackAudioMode()
        return
      }
      recorder.record()
      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setStatus(RECORDER_STATUS.RECORDING)
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current
        setElapsedMs(elapsed)
        if (elapsed >= VOICE_MAX_DURATION_MS) {
          finish().then((note) => { if (note) onLimitRef.current?.(note) }).catch(() => {})
        }
      }, TICK_MS)
    } catch {
      clearTimer()
      setPlaybackAudioMode()
      if (!isUnmountedRef.current) setStatus(RECORDER_STATUS.ERROR)
    } finally {
      isStartingRef.current = false
    }
  }, [recorder, finish])

  /** @returns {Promise<{ uri: string, durationMs: number } | null>} */
  const stop = useCallback(() => (timerRef.current ? finish() : Promise.resolve(null)), [finish])

  const cancel = useCallback(async () => {
    if (!timerRef.current) return
    await finish().catch(() => null)
  }, [finish])

  // Al salir del chat con una grabación abierta, se descarta.
  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
      if (!timerRef.current) return
      clearTimer()
      try {
        Promise.resolve(recorder.stop()).catch(() => {})
      } catch {
        // `stop` puede lanzar de forma sincrónica: ya se está saliendo, no hay nada que hacer.
      }
      setPlaybackAudioMode()
    }
  }, [recorder])

  return { status, elapsedMs, isRecording: status === RECORDER_STATUS.RECORDING, start, stop, cancel }
}
