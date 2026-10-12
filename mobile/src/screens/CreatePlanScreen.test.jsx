import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { CATALOG, COMPLETE_USER, SignedIn, USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { TEXTS as PLACE } from '../components/LocationPicker.jsx'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import * as plansApi from '../services/api/plans.js'
import { findAddress, getCurrentCoordinates } from '../services/location.js'
import CreatePlanScreen, { TEXTS } from './CreatePlanScreen.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/plans.js', () => ({ createPlan: jest.fn(), updatePlan: jest.fn() }))
jest.mock('../services/location.js', () => ({
  ...jest.requireActual('../services/location.js'),
  findAddress: jest.fn(),
  getCurrentCoordinates: jest.fn()
}))

const navigation = { navigate: jest.fn(), popTo: jest.fn() }
const DAY_MS = 24 * 60 * 60 * 1000
const startsAt = new Date(Date.now() + 2 * DAY_MS)
const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000)

const PLAN = Object.freeze({
  id: 'p1',
  title: 'Partido de fútbol',
  description: 'Traer camiseta',
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.16, -34.9] },
  capacity: 10,
  price: 150,
  interests: ['futbol']
})

async function renderScreen ({ user = COMPLETE_USER, plan } = {}) {
  const service = createFakeAuthService({ user })
  const route = { params: plan ? { plan } : undefined }
  return renderWithAuth(<SignedIn><CreatePlanScreen navigation={navigation} route={route} /></SignedIn>, { service })
}

const field = (label) => screen.getByLabelText(label)
const pickDate = async (label, date) => {
  await fireEvent.press(screen.getByRole('button', { name: label }))
  await act(async () => screen.getByTestId(`${label}-picker`).props.onValueChange({}, date))
}
const mapEvent = (latitude, longitude) => ({ nativeEvent: { coordinate: { latitude, longitude } } })

// Completa todo salvo el lugar en el mapa y el cupo.
async function fillBasics () {
  await fireEvent.changeText(field(TEXTS.title), 'Partido de fútbol')
  await pickDate(TEXTS.startsAt, startsAt)
  await pickDate(TEXTS.endsAt, endsAt)
  await fireEvent.changeText(field(TEXTS.locationLabel), 'Cancha del campus')
  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Fútbol' }))
}

describe('CreatePlanScreen', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    navigation.navigate.mockReset()
    navigation.popTo.mockReset()
    resetCatalogsCache()
    getCatalogs.mockReset().mockResolvedValue(CATALOG)
    plansApi.createPlan.mockReset()
    plansApi.updatePlan.mockReset()
    findAddress.mockReset()
    getCurrentCoordinates.mockReset()
    DateTimePickerAndroid.open.mockReset()
  })

  afterEach(() => jest.restoreAllMocks())

  describe('crear', () => {
    it('con el perfil incompleto explica qué falta y lleva al perfil (no muestra el formulario)', async () => {
      await renderScreen({ user: { ...USER, onboardingCompleted: true } })

      expect(await screen.findByText(TEXTS.incompleteTitle)).toBeOnTheScreen()
      expect(screen.queryByLabelText(TEXTS.title)).not.toBeOnTheScreen()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.goToProfile }))
      expect(navigation.navigate).toHaveBeenCalledWith('ProfileTab')
    })

    it('valida en el teléfono: sin datos muestra los errores por campo y no llama a la API', async () => {
      await renderScreen()

      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.create }))

      expect(screen.getByText(/El título necesita/)).toBeOnTheScreen()
      expect(screen.getByText('Elegí cuándo empieza.')).toBeOnTheScreen()
      expect(screen.getByText('Elegí cuándo termina.')).toBeOnTheScreen()
      expect(screen.getByText('Marcá el lugar en el mapa.')).toBeOnTheScreen()
      expect(screen.getByText('Ingresá el nombre del lugar.')).toBeOnTheScreen()
      expect(screen.getByText(/El cupo es un número/)).toBeOnTheScreen()
      expect(screen.getByText('Elegí al menos un tipo de actividad.')).toBeOnTheScreen()
      expect(plansApi.createPlan).not.toHaveBeenCalled()
    })

    it('flujo completo: buscar la dirección, ajustar el pin, cupo y costo → crea el plan y abre su detalle', async () => {
      findAddress.mockResolvedValue([-56.166, -34.913])
      plansApi.createPlan.mockResolvedValue({ ...PLAN, id: 'nuevo' })
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillBasics()

      await fireEvent.changeText(field(PLACE.address), 'Parque Rodó, Montevideo')
      await fireEvent.press(screen.getByRole('button', { name: PLACE.search }))
      expect((await screen.findByTestId('location-pin')).props.coordinate).toEqual({ latitude: -34.913, longitude: -56.166 })
      await fireEvent(screen.getByTestId('location-pin'), 'dragEnd', mapEvent(-34.9135, -56.1665))
      await fireEvent.changeText(field(TEXTS.capacity), '12')
      await fireEvent.changeText(field(TEXTS.price), '150')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await screen.findByRole('button', { name: TEXTS.create })
      expect(findAddress).toHaveBeenCalledWith('Parque Rodó, Montevideo')
      expect(plansApi.createPlan).toHaveBeenCalledWith({
        title: 'Partido de fútbol',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: { label: 'Cancha del campus', type: 'Point', coordinates: [-56.1665, -34.9135] },
        capacity: 12,
        price: 150,
        interests: ['futbol']
      })
      expect(navigation.navigate).toHaveBeenCalledWith('FeedTab', { screen: 'Plan', params: { planId: 'nuevo' }, initial: false })
    })

    it('"Usar mi ubicación" pone el pin en la posición actual', async () => {
      getCurrentCoordinates.mockResolvedValue({ status: 'granted', coordinates: [-56.1645, -34.9011] })
      await renderScreen()

      await fireEvent.press(await screen.findByRole('button', { name: PLACE.myLocation }))

      expect((await screen.findByTestId('location-pin')).props.coordinate).toEqual({ latitude: -34.9011, longitude: -56.1645 })
    })

    it('sin permiso de ubicación lo explica y se puede seguir tocando el mapa', async () => {
      getCurrentCoordinates.mockResolvedValue({ status: 'denied', coordinates: null })
      await renderScreen()

      await fireEvent.press(await screen.findByRole('button', { name: PLACE.myLocation }))
      expect(await screen.findByText(/Sin permiso de ubicación/)).toBeOnTheScreen()

      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.2))
      expect(screen.getByTestId('location-pin').props.coordinate).toEqual({ latitude: -34.9, longitude: -56.2 })
    })

    it('interruptor "Cupo ilimitado": oculta el campo de cupo y manda capacity null', async () => {
      plansApi.createPlan.mockResolvedValue(PLAN)
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillBasics()
      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))

      await fireEvent(screen.getByRole('switch', { name: TEXTS.unlimited }), 'valueChange', true)
      expect(screen.queryByLabelText(TEXTS.capacity)).not.toBeOnTheScreen()
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await screen.findByRole('button', { name: TEXTS.create })
      expect(plansApi.createPlan.mock.calls[0][0]).toMatchObject({ capacity: null, price: 0 })
    })

    it('no da el plan por creado hasta que el servidor responde; mientras, el botón queda ocupado', async () => {
      const pending = deferred()
      plansApi.createPlan.mockReturnValue(pending.promise)
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillBasics()
      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))
      await fireEvent.changeText(field(TEXTS.capacity), '5')

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      expect(screen.getByRole('button', { name: TEXTS.create })).toBeDisabled()
      expect(navigation.navigate).not.toHaveBeenCalled()
      await act(async () => pending.resolve(PLAN))
      expect(navigation.navigate).toHaveBeenCalled()
    })

    it('un error del servidor se muestra y conserva lo cargado', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillBasics()
      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))
      await fireEvent.changeText(field(TEXTS.capacity), '5')

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(field(TEXTS.title).props.value).toBe('Partido de fútbol')
      expect(navigation.navigate).not.toHaveBeenCalled()
    })

    it('en Android el selector abre el diálogo de fecha y después el de hora', async () => {
      jest.replaceProperty(Platform, 'OS', 'android')
      await renderScreen()

      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.startsAt }))
      const day = new Date(2027, 0, 15, 9, 0)
      await act(async () => DateTimePickerAndroid.open.mock.calls[0][0].onValueChange({}, day))
      const picked = new Date(2027, 0, 15, 18, 30)
      await act(async () => DateTimePickerAndroid.open.mock.calls[1][0].onValueChange({}, picked))

      expect(DateTimePickerAndroid.open.mock.calls.map(([options]) => options.mode)).toEqual(['date', 'time'])
      expect(screen.getByText('vie 15/01 · 18:30')).toBeOnTheScreen()
    })
  })

  describe('editar', () => {
    it('muestra los datos del plan y manda solo lo que cambió; después vuelve al detalle actualizado', async () => {
      plansApi.updatePlan.mockResolvedValue({ ...PLAN, title: 'Fútbol 5 mixto' })
      await renderScreen({ plan: PLAN })

      expect((await screen.findByLabelText(TEXTS.title)).props.value).toBe('Partido de fútbol')
      expect(field(TEXTS.capacity).props.value).toBe('10')
      expect(screen.getByTestId('location-pin').props.coordinate).toEqual({ latitude: -34.9, longitude: -56.16 })

      await fireEvent.changeText(field(TEXTS.title), 'Fútbol 5 mixto')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.save }))

      await act(async () => {})
      expect(plansApi.updatePlan).toHaveBeenCalledWith('p1', { title: 'Fútbol 5 mixto' })
      expect(navigation.popTo).toHaveBeenCalledWith('Plan', { planId: 'p1', version: expect.any(Number) })
      expect(plansApi.createPlan).not.toHaveBeenCalled()
    })

    it('un plan con cupo ilimitado arranca con el interruptor activado; apagarlo pide un cupo', async () => {
      plansApi.updatePlan.mockResolvedValue({ ...PLAN, capacity: 30 })
      await renderScreen({ plan: { ...PLAN, capacity: null } })

      const toggle = await screen.findByRole('switch', { name: TEXTS.unlimited })
      expect(toggle.props.value).toBe(true)
      expect(screen.queryByLabelText(TEXTS.capacity)).not.toBeOnTheScreen()

      await fireEvent(toggle, 'valueChange', false)
      await fireEvent.changeText(field(TEXTS.capacity), '30')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.save }))

      await act(async () => {})
      expect(plansApi.updatePlan).toHaveBeenCalledWith('p1', { capacity: 30 })
    })

    it('409 por cupo menor a los inscriptos se muestra junto al campo de cupo', async () => {
      plansApi.updatePlan.mockRejectedValue(new ApiError({ status: 409, code: 'CAPACITY_BELOW_PARTICIPANTS', message: 'El cupo no puede ser menor que los 4 inscriptos' }))
      await renderScreen({ plan: PLAN })

      await fireEvent.changeText(await screen.findByLabelText(TEXTS.capacity), '3')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.save }))

      expect(await screen.findByText('El cupo no puede ser menor que los 4 inscriptos')).toBeOnTheScreen()
      expect(navigation.popTo).not.toHaveBeenCalled()
    })
  })
})
