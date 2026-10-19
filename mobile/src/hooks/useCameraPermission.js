import { useCallback, useEffect, useState } from 'react'

import { requestCameraPermission } from '../services/camera.js'

export const CAMERA_PERMISSION = Object.freeze({ ASKING: 'asking', GRANTED: 'granted', DENIED: 'denied' })

/**
 * Permiso de cámara para leer el QR: se pide al montar (en el momento en que se usa) y otra vez con `retry`
 * (p. ej. después de darlo desde los ajustes del teléfono).
 * @returns {{ status: 'asking' | 'granted' | 'denied', retry: () => void }}
 */
export function useCameraPermission () {
  const [status, setStatus] = useState(CAMERA_PERMISSION.ASKING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    // `requestCameraPermission` nunca rechaza: un error del módulo nativo cuenta como "sin permiso".
    requestCameraPermission().then((isGranted) => {
      if (isCurrent) setStatus(isGranted ? CAMERA_PERMISSION.GRANTED : CAMERA_PERMISSION.DENIED)
    })
    return () => { isCurrent = false }
  }, [attempt])

  const retry = useCallback(() => {
    setStatus(CAMERA_PERMISSION.ASKING)
    setAttempt((value) => value + 1)
  }, [])

  return { status, retry }
}
