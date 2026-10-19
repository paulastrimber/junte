import { fireEvent, render, screen } from '@testing-library/react-native'

import { MAX_INTERESTS } from '../utils/catalog.js'
import { InterestPicker } from './InterestPicker.jsx'

// Cuenta qué chips se pintan, sin cambiar lo que hacen (la función de adentro del `memo` real).
const mockChipRenders = []
jest.mock('./Chip.jsx', () => {
  const { memo } = require('react')
  const actual = jest.requireActual('./Chip.jsx')
  return { Chip: memo((props) => { mockChipRenders.push(props.label); return actual.Chip.type(props) }) }
})

const CATEGORIES = [
  { key: 'deportes', name: 'Deportes', interests: [{ key: 'futbol', name: 'Fútbol' }, { key: 'padel', name: 'Pádel' }] },
  { key: 'arte', name: 'Arte y cultura', interests: [{ key: 'teatro', name: 'Teatro' }] }
]
const MANY = [{ key: 'todos', name: 'Todos', interests: Array.from({ length: MAX_INTERESTS + 1 }, (_, i) => ({ key: `i-${i}`, name: `Interés ${i}` })) }]

describe('InterestPicker', () => {
  it('muestra cada categoría con sus intereses', async () => {
    await render(<InterestPicker categories={CATEGORIES} selected={['padel']} onToggle={jest.fn()} />)

    expect(screen.getByRole('header', { name: 'Deportes' })).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: 'Arte y cultura' })).toBeOnTheScreen()
    expect(screen.getByRole('checkbox', { name: 'Pádel' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fútbol' })).not.toBeChecked()
  })

  it('al tocar un interés avisa su key', async () => {
    const onToggle = jest.fn()
    await render(<InterestPicker categories={CATEGORIES} selected={[]} onToggle={onToggle} />)

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Teatro' }))

    expect(onToggle).toHaveBeenCalledWith('teatro')
  })

  it('en el máximo deshabilita los no elegidos, pero deja soltar los elegidos', async () => {
    const selected = Array.from({ length: MAX_INTERESTS }, (_, i) => `i-${i}`)
    await render(<InterestPicker categories={MANY} selected={selected} onToggle={jest.fn()} />)

    expect(screen.getByRole('checkbox', { name: `Interés ${MAX_INTERESTS}` })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Interés 0' })).toBeEnabled()
  })

  it('al marcar un interés solo se vuelve a pintar ese chip', async () => {
    const onToggle = jest.fn()
    const { rerender } = await render(<InterestPicker categories={CATEGORIES} selected={[]} onToggle={onToggle} />)
    mockChipRenders.length = 0

    await rerender(<InterestPicker categories={CATEGORIES} selected={['teatro']} onToggle={onToggle} />)

    expect(mockChipRenders).toEqual(['Teatro'])
  })
})
