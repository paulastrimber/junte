import { fireEvent, render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { PlanCard } from './PlanCard.jsx'

const BASE = Object.freeze({ id: 'p1', title: 'Fútbol 5', schedule: 'dom 25/10 · 18:00 a 20:00', place: 'Parque Rodó', price: 'Gratis', spots: 'Quedan 3 lugares' })

describe('PlanCard', () => {
  it('se lee como un solo botón con todo lo que muestra, incluida la distancia', async () => {
    const onPress = jest.fn()
    await render(<PlanCard {...BASE} distance='a 2,4 km' onPress={onPress} />)

    const card = screen.getByRole('button', { name: 'Fútbol 5. dom 25/10 · 18:00 a 20:00. Parque Rodó, a 2,4 km. Gratis. Quedan 3 lugares' })
    await fireEvent.press(card)
    expect(onPress).toHaveBeenCalledWith('p1')
  })

  it('una tarjeta llena dice "Lleno" al lector, sin repetirlo si el cupo ya lo dice', async () => {
    await render(<PlanCard {...BASE} spots='Lleno' isFull onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: /Lleno$/ })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /Lleno\. Lleno/ })).not.toBeOnTheScreen()

    // En "Mis planes" el cupo muestra el estado ("Cancelado") y el candado solo no alcanza.
    await screen.rerender(<PlanCard {...BASE} spots='Cancelado' isFull onPress={jest.fn()} />)
    expect(screen.getByRole('button', { name: /Cancelado\. Lleno$/ })).toBeOnTheScreen()
  })

  it('sin distancia (feed por fecha) el nombre no la menciona y avisa que abre el detalle', async () => {
    await render(<PlanCard {...BASE} onPress={jest.fn()} />)

    const card = screen.getByRole('button', { name: 'Fútbol 5. dom 25/10 · 18:00 a 20:00. Parque Rodó. Gratis. Quedan 3 lugares' })
    expect(card.props.accessibilityHint).toBe('Abre el detalle del plan')
  })

  it('con cupo ilimitado dice "Sin límite de cupo" y nunca "Lleno"', async () => {
    await render(<PlanCard {...BASE} spots='Sin límite de cupo' onPress={jest.fn()} />)

    expect(screen.getByRole('button', { name: /Sin límite de cupo$/ })).toBeOnTheScreen()
    expect(screen.queryByText('Lleno')).not.toBeOnTheScreen()
  })

  it('un plan gratis destaca el precio con otro color que uno pago (y el texto dice "Gratis")', async () => {
    // Fondo de la etiqueta: el del primer contenedor del texto que tenga uno.
    const priceBackground = (label) => {
      for (let node = screen.getByText(label).parent; node; node = node.parent) {
        const color = StyleSheet.flatten(node.props?.style)?.backgroundColor
        if (color) return color
      }
      return null
    }
    await render(
      <>
        <PlanCard {...BASE} id='gratis' isFree onPress={jest.fn()} />
        <PlanCard {...BASE} id='pago' price='$ 150' onPress={jest.fn()} />
      </>
    )

    expect(priceBackground('Gratis')).toEqual(expect.any(String))
    expect(priceBackground('Gratis')).not.toBe(priceBackground('$ 150'))
  })
})
