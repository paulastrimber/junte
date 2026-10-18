import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { sizes } from '../theme/index.js'
import { Chip } from './Chip.jsx'
import { ChipGroup, SEGMENT_MAX_LINES } from './ChipGroup.jsx'

const OPTIONS = Object.freeze([{ key: 'available', label: 'Con cupo' }, { key: 'full', label: 'Llenos' }])

// Estilo de un control sin apretar (el de `Pressable` puede ser una función).
const styleOf = (element) => StyleSheet.flatten(typeof element.props.style === 'function' ? element.props.style({ pressed: false }) : element.props.style)

// Alto táctil real de un control: su alto mínimo más lo que el `hitSlop` agranda arriba y abajo.
function touchHeight (element) {
  const style = styleOf(element)
  const slop = element.props.hitSlop ?? {}
  return (style?.minHeight ?? 0) + (slop.top ?? 0) + (slop.bottom ?? 0)
}

describe('ChipGroup', () => {
  it('de una sola opción: radios con el título del grupo como encabezado; la elegida queda marcada', async () => {
    await render(<ChipGroup label='Qué planes ver' options={OPTIONS} selected={['full']} onSelect={jest.fn()} />)

    expect(screen.getByRole('header', { name: 'Qué planes ver' })).toBeOnTheScreen()
    expect(screen.getByRole('radio', { name: 'Llenos' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Con cupo' })).not.toBeChecked()
  })

  it('al tocar una opción avisa su key', async () => {
    const onSelect = jest.fn()
    await render(<ChipGroup label='Qué planes ver' options={OPTIONS} selected={['available']} onSelect={onSelect} />)

    await fireEvent.press(screen.getByRole('radio', { name: 'Llenos' }))

    expect(onSelect).toHaveBeenCalledWith('full')
  })

  it('con multiple las opciones son checkbox y se pueden marcar varias', async () => {
    const options = [{ key: 'free', label: 'Gratis' }, { key: 'low', label: '$ 1 a $ 500' }, { key: 'high', label: 'Más de $ 1.000' }]
    const onSelect = jest.fn()
    await render(<ChipGroup label='Costo' options={options} selected={['free', 'high']} onSelect={onSelect} multiple />)

    expect(screen.getByRole('checkbox', { name: 'Gratis' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Más de $ 1.000' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '$ 1 a $ 500' })).not.toBeChecked()
    await fireEvent.press(screen.getByRole('checkbox', { name: '$ 1 a $ 500' }))
    expect(onSelect).toHaveBeenCalledWith('low')
  })

  it('segmentado: mismas opciones como radio, con el título oculto (sigue siendo el nombre del grupo)', async () => {
    const onSelect = jest.fn()
    await render(<ChipGroup label='Qué planes ver' options={OPTIONS} selected={['available']} onSelect={onSelect} variant='segmented' hideLabel />)

    expect(screen.queryByRole('header', { name: 'Qué planes ver' })).not.toBeOnTheScreen()
    expect(screen.getByLabelText('Qué planes ver')).toBeOnTheScreen()
    expect(screen.getByRole('radio', { name: 'Con cupo' })).toBeChecked()
    await fireEvent.press(screen.getByRole('radio', { name: 'Llenos' }))
    expect(onSelect).toHaveBeenCalledWith('full')
  })

  it('el chip mide al menos 48 de alto contando el hitSlop', async () => {
    await render(<Chip label='Fútbol' selected={false} onPress={jest.fn()} />)

    expect(touchHeight(screen.getByRole('checkbox', { name: 'Fútbol' }))).toBeGreaterThanOrEqual(sizes.touch)
  })

  // BUG-QA-4: los segmentos del control segmentado miden 40 (`touchSmall`) y, a diferencia de Chip y del Button `sm`,
  // no completan el área táctil hasta 48 con `hitSlop`.
  it('cada segmento del control segmentado mide al menos 48 de alto contando el hitSlop', async () => {
    await render(<ChipGroup label='Qué planes ver' options={OPTIONS} selected={['available']} onSelect={jest.fn()} variant='segmented' />)

    for (const segment of screen.getAllByRole('radio')) expect(touchHeight(segment)).toBeGreaterThanOrEqual(sizes.touch)
  })

  // Con texto grande la etiqueta de un segmento no se corta con "…": baja a una segunda línea y el segmento crece.
  it('segmentado: las etiquetas usan hasta 2 líneas y los segmentos crecen en alto (minHeight, sin alto fijo)', async () => {
    const options = [{ key: 'joined', label: 'Planes a los que voy' }, { key: 'created', label: 'Organizo' }]
    await render(<ChipGroup label='Mostrar' options={options} selected={['joined']} onSelect={jest.fn()} variant='segmented' />)

    expect(SEGMENT_MAX_LINES).toBe(2)
    for (const option of options) expect(screen.getByText(option.label).props.numberOfLines).toBe(SEGMENT_MAX_LINES)
    for (const segment of screen.getAllByRole('radio')) {
      const style = styleOf(segment)
      expect(style.height).toBeUndefined()
      expect(style.minHeight).toBe(sizes.touchSmall)
    }
    // Todos los segmentos de la pista con el mismo alto: la pista estira a sus hijos.
    let track = screen.getAllByRole('radio')[0].parent
    while (styleOf(track)?.flexDirection !== 'row') track = track.parent
    expect(styleOf(track).alignItems).toBe('stretch')
  })
})
