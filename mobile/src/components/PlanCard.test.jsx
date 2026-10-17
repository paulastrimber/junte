import { fireEvent, render, screen } from '@testing-library/react-native'

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
})
