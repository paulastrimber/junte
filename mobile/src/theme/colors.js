// Paleta de junte: violeta de marca + lima de acento, en pares claro/oscuro.
// Los colores se piden por ROL (colors.primary, colors.textMuted…), nunca por valor: este archivo es el único
// lugar de la app con hexadecimales. Los pares texto/fondo cumplen contraste AA (4.5:1) en los dos modos.
// Detalle y reglas de uso: docs/practicas/diseno-ui.md.

const light = Object.freeze({
  background: '#F7F5FC',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEAFB',
  border: '#E0D9F2',
  text: '#1B1530',
  textMuted: '#5E5678',
  primary: '#6A35E8',
  onPrimary: '#FFFFFF',
  primarySoft: '#EBE3FF',
  onPrimarySoft: '#4A1FB8',
  // El lima va solo como relleno con `onAccent` encima (reputación, punto de la marca); nunca como color de texto.
  accent: '#C6F432',
  onAccent: '#1B1530',
  success: '#177A45',
  successSoft: '#E1F5E9',
  warning: '#8A5300',
  warningSoft: '#FFF1D6',
  danger: '#C0281F',
  dangerSoft: '#FDE7E4',
  // Fondo detrás de las hojas modales.
  scrim: 'rgba(27, 21, 48, 0.45)'
})

const dark = Object.freeze({
  background: '#110D1D',
  surface: '#1B1530',
  surfaceAlt: '#261E42',
  border: '#382E5C',
  text: '#F3F0FB',
  textMuted: '#ADA4C8',
  primary: '#9B7BFF',
  onPrimary: '#110D1D',
  primarySoft: '#2E2259',
  onPrimarySoft: '#CDBDFF',
  accent: '#C6F432',
  onAccent: '#1B1530',
  success: '#5FD08F',
  successSoft: '#12301F',
  warning: '#F2B94B',
  warningSoft: '#3A2A08',
  danger: '#FF8A80',
  dangerSoft: '#3D1512',
  scrim: 'rgba(0, 0, 0, 0.6)'
})

export const palettes = Object.freeze({ light, dark })
