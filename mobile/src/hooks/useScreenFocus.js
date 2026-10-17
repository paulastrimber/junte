import { useEffect, useRef, useState } from 'react'

// Foco de la pantalla con los eventos de React Navigation (`focus` / `blur`). Se escucha `navigation.addListener` en
// lugar de usar `useIsFocused` de @react-navigation/native porque los tests de pantalla montan sin `NavigationContainer`.

/**
 * La pantalla está en primer plano (p. ej. para hacer polling solo mientras se ve).
 * @param {{ addListener: (event: string, handler: () => void) => () => void }} navigation
 * @returns {boolean}
 */
export function useScreenFocus (navigation) {
  const [isFocused, setIsFocused] = useState(true)
  useEffect(() => {
    const stopFocus = navigation.addListener('focus', () => setIsFocused(true))
    const stopBlur = navigation.addListener('blur', () => setIsFocused(false))
    return () => {
      stopFocus()
      stopBlur()
    }
  }, [navigation])
  return isFocused
}

/**
 * Vuelve a pedir los datos cada vez que se vuelve a la pantalla (otra pestaña, una pantalla de más arriba en el stack).
 * React Navigation emite `focus` también al montar: ese primero se ignora, porque el hook de datos ya hace su
 * carga inicial (si no, cada entrada pediría todo dos veces).
 * @param {{ addListener: (event: string, handler: () => void) => () => void }} navigation
 * @param {() => void} refresh
 */
export function useRefreshOnFocus (navigation, refresh) {
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  useEffect(() => {
    let isFirst = true
    return navigation.addListener('focus', () => {
      if (isFirst) {
        isFirst = false
        return
      }
      refreshRef.current()
    })
  }, [navigation])
}
