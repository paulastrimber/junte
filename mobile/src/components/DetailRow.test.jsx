import { render, screen } from '@testing-library/react-native'

import { DetailRow } from './DetailRow.jsx'

describe('DetailRow', () => {
  it('se lee como un solo dato: rótulo y valor', async () => {
    await render(<DetailRow label='Cuándo' value='sáb 25/10 · 18:00 a 20:00' icon='calendar-outline' />)

    expect(screen.getByLabelText('Cuándo: sáb 25/10 · 18:00 a 20:00')).toBeOnTheScreen()
    expect(screen.getByText('sáb 25/10 · 18:00 a 20:00')).toBeOnTheScreen()
  })

  it('la aclaración se suma al nombre accesible', async () => {
    await render(<DetailRow label='Dónde' value='Parque Rodó' hint='a 2,4 km' />)

    expect(screen.getByLabelText('Dónde: Parque Rodó. a 2,4 km')).toBeOnTheScreen()
    expect(screen.getByText('a 2,4 km')).toBeOnTheScreen()
  })
})
