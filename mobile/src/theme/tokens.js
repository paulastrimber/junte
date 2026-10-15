// Medidas del sistema de diseño (no dependen del modo claro/oscuro).

/** Espaciado en una grilla de 4. Se nombra por tamaño, no por uso. */
export const spacing = Object.freeze({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 })

/** Radios: `md` inputs, `lg` botones, `xl` tarjetas, `pill` chips y etiquetas. */
export const radius = Object.freeze({ sm: 8, md: 12, lg: 14, xl: 18, pill: 999 })

/** `touch`: alto mínimo de todo lo que se toca. `icon*`: tamaños de ícono. */
export const sizes = Object.freeze({ touch: 48, touchSmall: 40, input: 50, iconSm: 16, iconMd: 20, iconLg: 24 })

/** Duraciones (ms) para que las animaciones de la app se sientan emparentadas. */
export const motion = Object.freeze({ fast: 150, base: 250 })

// Una sola sombra, suave, para tarjetas. En modo oscuro la separación la da el borde.
export const shadows = Object.freeze({
  light: Object.freeze({ card: '0 2px 8px rgba(40, 20, 100, 0.08)' }),
  dark: Object.freeze({ card: undefined })
})
