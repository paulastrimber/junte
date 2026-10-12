import { fireEvent, render, screen } from '@testing-library/react-native'

import { LocationPicker, TEXTS } from './LocationPicker.jsx'

function setup (props = {}) {
  const handlers = { onChange: jest.fn(), onAddressChange: jest.fn(), onSearch: jest.fn(), onUseMyLocation: jest.fn() }
  return { handlers, view: render(<LocationPicker coordinates={null} address='' {...handlers} {...props} />) }
}

const mapEvent = (latitude, longitude) => ({ nativeEvent: { coordinate: { latitude, longitude } } })

describe('LocationPicker', () => {
  it('sin punto elegido muestra el mapa centrado en Montevideo, sin pin, y explica cómo ubicarlo', async () => {
    await setup().view

    expect(screen.getByTestId('location-map').props.region).toMatchObject({ latitude: -34.9011, longitude: -56.1645 })
    expect(screen.queryByTestId('location-pin')).not.toBeOnTheScreen()
    expect(screen.getByText(TEXTS.empty)).toBeOnTheScreen()
  })

  it('con un punto ([lng, lat]) centra el mapa ahí y pone un pin arrastrable', async () => {
    await setup({ coordinates: [-56.166, -34.913] }).view

    const pin = screen.getByTestId('location-pin')
    expect(pin.props.coordinate).toEqual({ latitude: -34.913, longitude: -56.166 })
    expect(pin.props.draggable).toBe(true)
    expect(screen.getByTestId('location-map').props.region).toMatchObject({ latitude: -34.913, longitude: -56.166 })
    expect(screen.getByText(TEXTS.hint)).toBeOnTheScreen()
  })

  it('arrastrar el pin devuelve el punto nuevo como GeoJSON [lng, lat]', async () => {
    const { handlers, view } = setup({ coordinates: [-56.166, -34.913] })
    await view

    await fireEvent(screen.getByTestId('location-pin'), 'dragEnd', mapEvent(-34.92, -56.15))

    expect(handlers.onChange).toHaveBeenCalledWith([-56.15, -34.92])
  })

  it('tocar el mapa también mueve el punto', async () => {
    const { handlers, view } = setup()
    await view

    await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.2))

    expect(handlers.onChange).toHaveBeenCalledWith([-56.2, -34.9])
  })

  it('buscador de dirección y "usar mi ubicación" avisan al hook', async () => {
    const { handlers, view } = setup({ address: 'Parque' })
    await view

    await fireEvent.changeText(screen.getByLabelText(TEXTS.address), 'Parque Rodó')
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.search }))
    await fireEvent(screen.getByLabelText(TEXTS.address), 'submitEditing')
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.myLocation }))

    expect(handlers.onAddressChange).toHaveBeenCalledWith('Parque Rodó')
    expect(handlers.onSearch).toHaveBeenCalledTimes(2)
    expect(handlers.onUseMyLocation).toHaveBeenCalledTimes(1)
  })

  it('mientras busca deshabilita las acciones; muestra el aviso de la búsqueda y el error del formulario', async () => {
    await setup({ isWorking: true, message: 'No encontramos esa dirección.', error: 'Marcá el lugar en el mapa.' }).view

    expect(screen.getByRole('button', { name: TEXTS.myLocation })).toBeDisabled()
    expect(screen.getByText('No encontramos esa dirección.')).toBeOnTheScreen()
    expect(screen.getByText('Marcá el lugar en el mapa.')).toBeOnTheScreen()
  })
})
