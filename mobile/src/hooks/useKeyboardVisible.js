import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

/**
 * `true` mientras el teclado está abierto. Sirve para esconder lo que, fijo abajo, se comería lo poco que queda visible.
 * @returns {boolean}
 */
export function useKeyboardVisible () {
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setIsVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return isVisible
}
