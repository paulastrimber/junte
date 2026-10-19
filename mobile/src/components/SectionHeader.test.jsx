import { fireEvent, render, screen } from '@testing-library/react-native'

import { SectionHeader } from './SectionHeader.jsx'

describe('SectionHeader', () => {
  it('el título es un encabezado y la bajada se muestra debajo', async () => {
    await render(<SectionHeader title='Quiénes van' description='Solo lo ven quienes participan.' />)

    expect(screen.getByRole('header', { name: 'Quiénes van' })).toBeOnTheScreen()
    expect(screen.getByText('Solo lo ven quienes participan.')).toBeOnTheScreen()
  })

  it('la acción aparece solo si tiene texto y manejador', async () => {
    const onAction = jest.fn()
    await render(<SectionHeader title='Intereses' actionTitle='Limpiar' onAction={onAction} />)

    await fireEvent.press(screen.getByRole('button', { name: 'Limpiar' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('sin manejador no hay botón', async () => {
    await render(<SectionHeader title='Intereses' actionTitle='Limpiar' />)

    expect(screen.queryByRole('button')).not.toBeOnTheScreen()
  })
})
