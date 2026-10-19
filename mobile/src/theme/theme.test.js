import { renderHook } from '@testing-library/react-native'
import { useColorScheme } from 'react-native'

import { createThemedStyles, fontScaleLimits, navigationTheme, palettes, sizes, spacing, typography, useTheme } from './index.js'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }))

// Contraste WCAG entre dos colores '#RRGGBB'.
function luminance (hex) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast (a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// Pares [texto, fondo] que la app usa de verdad.
const TEXT_PAIRS = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceAlt'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceAlt'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['onPrimary', 'primary'],
  ['onPrimarySoft', 'primarySoft'],
  ['onAccent', 'accent'],
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['danger', 'dangerSoft'],
  ['danger', 'surface'],
  ['danger', 'background'],
  ['onPrimarySoft', 'primarySoft'],
  ['textMuted', 'primarySoft']
]

// Pares [borde o gráfico, fondo] de componentes de interfaz: WCAG pide 3:1 (no es texto).
const UI_PAIRS = [
  ['borderStrong', 'background'],
  ['borderStrong', 'surface'],
  ['borderStrong', 'surfaceAlt'],
  ['accentEdge', 'background'],
  ['accentEdge', 'surface'],
  ['primary', 'surfaceAlt']
]

describe('tema', () => {
  it('los modos claro y oscuro definen exactamente los mismos roles de color', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort())
  })

  describe.each(['light', 'dark'])('modo %s', (scheme) => {
    it.each(TEXT_PAIRS)('%s sobre %s cumple contraste AA (4.5:1)', (foreground, background) => {
      expect(contrast(palettes[scheme][foreground], palettes[scheme][background])).toBeGreaterThanOrEqual(4.5)
    })

    it.each(UI_PAIRS)('%s sobre %s cumple contraste de componente (3:1)', (foreground, background) => {
      expect(contrast(palettes[scheme][foreground], palettes[scheme][background])).toBeGreaterThanOrEqual(3)
    })

    it('el tema de navegación usa la paleta de ese modo', () => {
      const theme = navigationTheme(scheme)

      expect(theme.dark).toBe(scheme === 'dark')
      expect(theme.colors).toMatchObject({ primary: palettes[scheme].primary, background: palettes[scheme].background, text: palettes[scheme].text })
    })
  })

  it('la tipografía elige el peso con la familia, sin fontWeight', () => {
    for (const style of Object.values(typography)) {
      expect(style.fontFamily).toMatch(/^PlusJakartaSans_/)
      expect(style).not.toHaveProperty('fontWeight')
    }
  })

  it('cada variante tiene un tope de escala de texto razonable (nunca apaga Dynamic Type)', () => {
    for (const limit of Object.values(fontScaleLimits)) expect(limit).toBeGreaterThan(1)
  })

  it('las medidas táctiles cumplen el mínimo: 48 o 40 + hitSlop', () => {
    expect(sizes.touch).toBeGreaterThanOrEqual(48)
    expect(sizes.input).toBeGreaterThanOrEqual(sizes.touch)
    expect(sizes.touch - sizes.touchSmall).toBeLessThanOrEqual(spacing.sm)
  })

  it('useTheme sigue el modo del sistema y cae a claro si no se conoce', async () => {
    useColorScheme.mockReturnValue('dark')
    expect((await renderHook(() => useTheme())).result.current).toMatchObject({ scheme: 'dark', isDark: true, colors: palettes.dark })

    useColorScheme.mockReturnValue(null)
    expect((await renderHook(() => useTheme())).result.current).toMatchObject({ scheme: 'light', isDark: false, colors: palettes.light })
  })

  it('createThemedStyles arma los estilos una vez por modo y los cambia con el sistema', async () => {
    const factory = jest.fn(({ colors }) => ({ box: { backgroundColor: colors.surface } }))
    const useStyles = createThemedStyles(factory)

    useColorScheme.mockReturnValue('light')
    const light = await renderHook(() => useStyles())
    await light.rerender()
    useColorScheme.mockReturnValue('dark')
    const dark = await renderHook(() => useStyles())

    expect(light.result.current.box).toEqual({ backgroundColor: palettes.light.surface })
    expect(dark.result.current.box).toEqual({ backgroundColor: palettes.dark.surface })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
