import { useEffect, useRef } from 'react'

import { useReducedMotion } from '../theme/index.js'
import { scrollTargetY } from '../utils/plans.js'

// Si el bloque no cambió de alto (o no llega su `onLayout`), se scrollea igual pasado este tiempo.
const LAYOUT_FALLBACK_MS = 300

/**
 * Scroll de un formulario largo hasta un bloque (el primer error, lo que se acaba de desplegar).
 * Las posiciones salen del `onLayout` de cada bloque; todo vive en refs para no re-renderizar con cada scroll.
 *
 *   const { scrollRef, scrollProps, register, reveal } = useFormScroll()
 *   <Screen scrollRef={scrollRef} {...scrollProps}>
 *     <View onLayout={register('title')}>…</View>
 *     <View onLayout={register('price', { parent: 'capacityGroup' })}>…</View>   // dentro de otro bloque registrado
 *
 * Nunca mueve el foco ni abre el teclado. Con "reducir movimiento", salta sin animación.
 */
export function useFormScroll () {
  const isReducedMotion = useReducedMotion()
  const scrollRef = useRef(null)
  const positions = useRef({})
  const parents = useRef({})
  const offset = useRef(0)
  const viewport = useRef(0)
  const pending = useRef({})

  useEffect(() => {
    const waiting = pending.current
    return () => { for (const { timer } of Object.values(waiting)) clearTimeout(timer) }
  }, [])

  // y relativa al contenido del ScrollView: suma la del contenedor registrado, si lo hay.
  function absolute (name) {
    const position = positions.current[name]
    if (!position) return null
    const parent = parents.current[name]
    if (!parent) return position
    const container = absolute(parent)
    return container ? { y: container.y + position.y, height: position.height } : null
  }

  function reveal (name, { align = 'nearest' } = {}) {
    // Después del commit y de los `onLayout` de este render: las posiciones ya son las nuevas.
    globalThis.requestAnimationFrame(() => {
      const block = absolute(name)
      if (!block) return
      const y = scrollTargetY(block, { offset: offset.current, viewport: viewport.current }, { align })
      if (y !== null) scrollRef.current?.scrollTo?.({ y, animated: !isReducedMotion })
    })
  }

  function flush (name) {
    const entry = pending.current[name]
    if (!entry) return
    clearTimeout(entry.timer)
    delete pending.current[name]
    reveal(name, entry.options)
  }

  /** Scrollea a `name` cuando cambie de alto (algo que se despliega), o a los 300 ms si no hubo layout. */
  function revealOnNextLayout (name, options) {
    clearTimeout(pending.current[name]?.timer)
    pending.current[name] = { options, timer: setTimeout(() => flush(name), LAYOUT_FALLBACK_MS) }
  }

  function register (name, { parent } = {}) {
    if (parent) parents.current[name] = parent
    return (event) => {
      const { y, height } = event.nativeEvent.layout
      positions.current[name] = { y, height }
      flush(name)
    }
  }

  const scrollProps = {
    onScroll: (event) => { offset.current = event.nativeEvent.contentOffset.y },
    onLayout: (event) => { viewport.current = event.nativeEvent.layout.height }
  }

  return { scrollRef, scrollProps, register, reveal, revealOnNextLayout }
}
