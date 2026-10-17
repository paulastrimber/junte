import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * `true` si la persona pidió reducir el movimiento (iOS: "Reducir movimiento"; Android: "Quitar animaciones").
 * Las animaciones que no responden a un toque (el pulso de los esqueletos) se apagan con esto.
 * @returns {boolean}
 */
export function useReducedMotion () {
  const [isReduced, setIsReduced] = useState(false)
  useEffect(() => {
    let isCurrent = true
    // En los tests (y en algunas plataformas) la consulta no existe, no devuelve una promesa o falla: se asume que no
    // hay preferencia. `Promise.resolve` cubre el caso en que no devuelve nada.
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((value) => { if (isCurrent) setIsReduced(Boolean(value)) })
      .catch(() => {})
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => setIsReduced(Boolean(value)))
    return () => {
      isCurrent = false
      subscription?.remove?.()
    }
  }, [])
  return isReduced
}
