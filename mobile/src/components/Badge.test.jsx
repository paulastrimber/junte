import { render, screen } from '@testing-library/react-native'

import { palettes } from '../theme/index.js'
import { Badge } from './Badge.jsx'

describe('Badge', () => {
  it('muestra el texto: el estado no depende solo del color', async () => {
    await render(<Badge label='Lleno' tone='danger' icon='lock-closed-outline' />)

    expect(screen.getByText('Lleno')).toBeOnTheScreen()
  })

  it('el tono `accent` va en lima con texto oscuro encima', async () => {
    await render(<Badge label='Gratis' tone='accent' />)

    expect(screen.getByText('Gratis')).toHaveStyle({ color: palettes.light.onAccent })
  })

  it('no se puede tocar', async () => {
    await render(<Badge label='Asististe' tone='success' />)

    expect(screen.queryByRole('button')).not.toBeOnTheScreen()
  })
})
