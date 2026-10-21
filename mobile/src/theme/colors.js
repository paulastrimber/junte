// Paleta de junte: violeta de marca + lima de acento, en pares claro/oscuro.
// Los colores se piden por ROL (colors.primary, colors.textMuted…), nunca por valor: este archivo es el único
// lugar de la app con hexadecimales. Los pares texto/fondo cumplen contraste AA (4.5:1) en los dos modos.
// Detalle y reglas de uso: docs/practicas/diseno-ui.md.

const light = Object.freeze({
  background: '#F7F5FC',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEAFB',
  // `border` separa superficies (decorativo). `borderStrong` marca el borde de un control que se toca (campos,
  // chips, botón secundario): llega a 3:1 contra el fondo, como pide WCAG para componentes de interfaz.
  border: '#E0D9F2',
  borderStrong: '#8A80A8',
  text: '#1B1530',
  textMuted: '#5E5678',
  primary: '#6A35E8',
  onPrimary: '#FFFFFF',
  primarySoft: '#EBE3FF',
  onPrimarySoft: '#4A1FB8',
  // El lima va solo como relleno con `onAccent` encima (reputación, punto de la marca); nunca como color de texto.
  accent: '#C6F432',
  onAccent: '#1B1530',
  // Borde del lima cuando cae sobre un fondo claro (sin él, el punto de la marca casi no se ve: 1.2:1).
  accentEdge: '#6B8A00',
  success: '#177A45',
  successSoft: '#E1F5E9',
  warning: '#8A5300',
  warningSoft: '#FFF1D6',
  danger: '#C0281F',
  dangerSoft: '#FDE7E4',
  // Fondo detrás de las hojas modales.
  scrim: 'rgba(27, 21, 48, 0.45)',
  // Onda de Android al tocar (`android_ripple`).
  ripple: 'rgba(106, 53, 232, 0.14)',
  // Fondo de la cámara y de cualquier medio a pantalla llena: oscuro en los dos modos.
  media: '#0E0B17'
})

const dark = Object.freeze({
  background: '#110D1D',
  surface: '#1B1530',
  surfaceAlt: '#261E42',
  border: '#382E5C',
  borderStrong: '#76699F',
  text: '#F3F0FB',
  textMuted: '#ADA4C8',
  primary: '#9B7BFF',
  onPrimary: '#110D1D',
  primarySoft: '#2E2259',
  onPrimarySoft: '#CDBDFF',
  accent: '#C6F432',
  onAccent: '#1B1530',
  accentEdge: '#C6F432',
  success: '#5FD08F',
  successSoft: '#12301F',
  warning: '#F2B94B',
  warningSoft: '#3A2A08',
  danger: '#FF8A80',
  dangerSoft: '#3D1512',
  scrim: 'rgba(0, 0, 0, 0.6)',
  ripple: 'rgba(155, 123, 255, 0.18)',
  media: '#0E0B17'
})

export const palettes = Object.freeze({ light, dark })
