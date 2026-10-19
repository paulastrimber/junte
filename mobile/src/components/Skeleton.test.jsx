import { render, screen } from '@testing-library/react-native'
import { AccessibilityInfo, Animated } from 'react-native'

import { PlanCardSkeleton, Skeleton } from './Skeleton.jsx'

describe('Skeleton', () => {
  it('un bloque suelto no se anuncia', async () => {
    await render(<Skeleton width={120} />)

    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen()
  })

  it('las tarjetas de carga se anuncian una sola vez, con el texto de qué se espera', async () => {
    await render(<PlanCardSkeleton label='Buscando planes…' count={2} />)

    const progress = screen.getByRole('progressbar', { name: 'Buscando planes…' })
    expect(progress).toBeOnTheScreen()
    expect(progress).toBeBusy()
  })

  it('las tarjetas de carga comparten un solo pulso: una consulta de "reducir movimiento" y un solo loop', async () => {
    const listen = jest.spyOn(AccessibilityInfo, 'addEventListener')
    const loop = jest.spyOn(Animated, 'loop')
    try {
      await render(<PlanCardSkeleton label='Buscando planes…' count={3} />)

      expect(listen.mock.calls.filter(([event]) => event === 'reduceMotionChanged')).toHaveLength(1)
      expect(loop).toHaveBeenCalledTimes(1)
    } finally {
      listen.mockRestore()
      loop.mockRestore()
    }
  })
})
