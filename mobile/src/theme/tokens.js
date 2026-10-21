// Medidas del sistema de diseño (no dependen del modo claro/oscuro). Reglas de uso: docs/practicas/diseno-ui.md.

/**
 * Espaciado en una grilla de 4. Se nombra por tamaño, no por uso. `xxs` (2) es solo para pegar líneas de texto
 * de un mismo bloque (título y detalle); entre bloques se usa de `sm` para arriba.
 */
export const spacing = Object.freeze({ xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 })

/**
 * Radios: `sm` etiquetas y burbujas, `md` campos y avisos, `lg` botones, `xl` tarjetas, `xxl` hojas y paneles,
 * `pill` chips y círculos. Más grande el elemento, más redondo: la jerarquía también se lee en las esquinas.
 */
export const radius = Object.freeze({ sm: 8, md: 12, lg: 14, xl: 18, xxl: 24, pill: 999 })

/**
 * `touch`: alto mínimo de todo lo que se toca. `touchSmall`: controles compactos (chips, botón `sm`), que
 * completan los 48 con `hitSlop`. `icon*`: tamaños de ícono. `avatar*` y `orb`: círculos de foto y de ícono.
 */
export const sizes = Object.freeze({
  touch: 48,
  touchSmall: 40,
  input: 50,
  textArea: 96,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 28,
  avatarSm: 32,
  avatarMd: 48,
  avatarLg: 96,
  orb: 64,
  map: 240,
  // Ancho máximo de un texto centrado (estados vacíos): renglones cortos se leen mejor.
  readable: 320,
  // Punto lima de la marca fuera del logo (estados vacíos, tarjetas).
  brandDot: 12
})

/** Grosores de borde: `thin` separa superficies, `thick` dibuja el contorno de un control, `heavy` marca el costado de un aviso. */
export const borders = Object.freeze({ thin: 1, thick: 1.5, heavy: 3 })

/**
 * Duraciones (ms) para que las animaciones de la app se sientan emparentadas. `fast`: respuesta a un toque;
 * `base`: algo que entra o sale; `slow`: pulso de los esqueletos de carga. `pressScale`: cuánto se achica lo que
 * se aprieta (sin animación: es instantáneo, como un botón físico).
 */
export const motion = Object.freeze({ fast: 150, base: 250, slow: 900, pressScale: 0.97 })

// Sombras suaves teñidas de violeta (no gris): `card` para tarjetas y `raised` para lo que flota (hojas, el
// segmento elegido). En modo oscuro la separación la da el borde, no la sombra.
export const shadows = Object.freeze({
  light: Object.freeze({ card: '0 2px 8px rgba(40, 20, 100, 0.08)', raised: '0 6px 18px rgba(40, 20, 100, 0.14)' }),
  dark: Object.freeze({ card: undefined, raised: undefined })
})
