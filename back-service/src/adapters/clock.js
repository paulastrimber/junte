// Reloj inyectable: la lógica que depende de la hora recibe `clock` y los tests pasan uno fijo.
// Nada de `Date.now()` suelto en servicios (docs/practicas/testing.md#convenciones).

/** @typedef {{ now: () => Date }} Clock */

/** @type {Clock} */
export const systemClock = Object.freeze({ now: () => new Date() })

/**
 * Reloj de test que se puede mover.
 * @param {Date | string} start
 * @returns {Clock & { set: (date: Date | string) => void, advance: (ms: number) => void }}
 */
export function createFixedClock (start) {
  let current = new Date(start)
  return {
    now: () => new Date(current),
    set (date) { current = new Date(date) },
    advance (ms) { current = new Date(current.getTime() + ms) }
  }
}
