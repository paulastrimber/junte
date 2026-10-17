import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { sizes } from '../theme/index.js'
import { Chip } from './Chip.jsx'
import { ChipGroup } from './ChipGroup.jsx'

const OPTIONS = Object.freeze([{ key: 'available', label: 'Con cupo' }, { key: 'full', label: 'Llenos' }])

// Alto táctil real de un control: su alto mínimo más lo que el `hitSlop` agranda arriba y abajo.
function touchHeight (element) {
  const style = StyleSheet.flatten(typeof element.props.style === 'function' ? element.props.style({ pressed: false }) : element.props.style)
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
})
