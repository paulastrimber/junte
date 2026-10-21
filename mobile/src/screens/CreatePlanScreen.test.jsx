import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { AccessibilityInfo, Keyboard, Platform, ScrollView } from 'react-native'

import { CATALOG, COMPLETE_USER, SignedIn, USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { REQUIRED_HINT } from '../components/FormField.jsx'
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

// Todo válido: lo básico, el pin y el cupo.
async function fillValid () {
  await fillBasics()
  await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))
  await fireEvent.changeText(field(TEXTS.capacity), '5')
}

// El `View` que registra la posición de un bloque del formulario: el primer ancestro con `onLayout`.
function wrapperOf (element) {
  let node = element
  while (node && !node.props.onLayout) node = node.parent
  return node
}
const layout = (element, y, height = 80) => fireEvent(element, 'layout', { nativeEvent: { layout: { x: 0, y, width: 360, height } } })
// Margen con el que se deja un bloque arriba al scrollear (`spacing.xl`).
const SCROLL_MARGIN = 24
// Asteriscos de un bloque, incluidos los ocultos al lector (que es como tienen que estar).
const asterisks = (element) => within(element).queryAllByText('*', { includeHiddenElements: true })
// El campo entero (etiqueta + caja) de un `FormField`, a partir de su `TextInput`.
const formFieldOf = (input) => input.parent.parent
// El aviso (alerta) que contiene un texto: los `FieldError` también son alertas.
const alertWith = (text) => screen.getAllByRole('alert').find((alert) => within(alert).queryByText(text))
// El `onPress` del botón, para llamarlo dos veces en el mismo frame (sin re-render entre medio).
function onPressOf (element) {
  let fiber = element.unstable_fiber
  while (fiber && !fiber.memoizedProps?.onPress) fiber = fiber.return
  return fiber.memoizedProps.onPress
}
// El ScrollView de `Screen`: el ancestro que escucha el scroll.
function scrollViewOf (element) {
  let node = element
  while (node && !node.props.onScroll) node = node.parent
  return node
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

  describe('feedback del envío', () => {
    let announce
    let scrollTo

    beforeEach(() => {
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {})
      scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo')
    })

    it('envío vacío: cartel con los campos que faltan, anuncio al lector y ningún request', async () => {
      await renderScreen()

      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.create }))

      const alert = alertWith('Revisá estos 7 datos')
      expect(within(alert).getByText('Revisá estos 7 datos')).toBeOnTheScreen()
      expect(within(alert).getByText('Título, Empieza, Termina y 4 más.')).toBeOnTheScreen()
      expect(announce).toHaveBeenCalledWith('Revisá estos 7 datos: Título, Empieza, Termina y 4 más.')
      expect(plansApi.createPlan).not.toHaveBeenCalled()
    })

    it('cada toque fallido se vuelve a anunciar, aunque el cartel ya estuviera', async () => {
      await renderScreen()
      const button = await screen.findByRole('button', { name: TEXTS.create })

      await fireEvent.press(button)
      await fireEvent.press(button)

      expect(announce).toHaveBeenCalledTimes(2)
    })

    it('el cartel se actualiza al corregir y desaparece cuando no queda nada por revisar', async () => {
      await renderScreen()
      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.create }))

      await fireEvent.changeText(field(TEXTS.title), 'Partido de fútbol')
      expect(screen.getByText('Revisá estos 6 datos')).toBeOnTheScreen()
      expect(screen.getByText('Empieza, Termina, Lugar en el mapa y 3 más.')).toBeOnTheScreen()

      await pickDate(TEXTS.startsAt, startsAt)
      await pickDate(TEXTS.endsAt, endsAt)
      await fireEvent.changeText(field(TEXTS.locationLabel), 'Cancha del campus')
      await fireEvent.press(await screen.findByRole('checkbox', { name: 'Fútbol' }))
      await fireEvent.changeText(field(TEXTS.capacity), '5')
      expect(screen.getByText('Revisá este dato')).toBeOnTheScreen()
      expect(screen.getByText('Lugar en el mapa.')).toBeOnTheScreen()

      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))
      expect(screen.queryByText(/^Revisá/)).not.toBeOnTheScreen()
    })

    it('el cartel se esconde con el teclado abierto y vuelve al cerrarlo', async () => {
      const listeners = {}
      jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
        listeners[name] = listener
        return { remove: jest.fn() }
      })
      await renderScreen()
      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.create }))
      expect(screen.getByText('Revisá estos 7 datos')).toBeOnTheScreen()

      await act(async () => listeners.keyboardDidShow())
      expect(screen.queryByText('Revisá estos 7 datos')).not.toBeOnTheScreen()
      // El error de cada campo sigue a la vista.
      expect(screen.getByText('Elegí cuándo empieza.')).toBeOnTheScreen()

      await act(async () => listeners.keyboardDidHide())
      expect(screen.getByText('Revisá estos 7 datos')).toBeOnTheScreen()
    })

    it('scrollea al primer campo con error en el orden visual, aunque haya varios', async () => {
      await renderScreen()
      await screen.findByRole('checkbox', { name: 'Fútbol' })
      // Viewport alto: lo que se despliega (el selector de fecha) ya se ve entero y no mueve el scroll.
      await layout(scrollViewOf(field(TEXTS.title)), 0, 2000)
      await layout(wrapperOf(field(TEXTS.title)), 100)
      await layout(wrapperOf(field(TEXTS.description)), 200)
      await layout(wrapperOf(screen.getByRole('button', { name: TEXTS.startsAt })), 360)
      await layout(wrapperOf(screen.getByRole('button', { name: TEXTS.endsAt })), 460)
      await layout(wrapperOf(screen.getByTestId('location-map')), 560, 400)
      await layout(wrapperOf(field(TEXTS.locationLabel)), 980)
      await layout(wrapperOf(screen.getByRole('switch', { name: TEXTS.unlimited })), 1080, 300)
      await layout(wrapperOf(screen.getByRole('checkbox', { name: 'Fútbol' })), 1400, 300)
      // Título y Empieza bien; fallan Termina, Lugar, Nombre del lugar, Cupo y Tipo de actividad.
      await fireEvent.changeText(field(TEXTS.title), 'Partido de fútbol')
      await pickDate(TEXTS.startsAt, startsAt)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await waitFor(() => expect(scrollTo).toHaveBeenCalled())
      expect(scrollTo).toHaveBeenCalledTimes(1)
      expect(scrollTo).toHaveBeenCalledWith({ y: 460 - SCROLL_MARGIN, animated: true })

      // Corregido lo de arriba, el siguiente intento lleva al primero que sigue fallando.
      await pickDate(TEXTS.endsAt, endsAt)
      await fireEvent.press(screen.getByTestId('location-map'), mapEvent(-34.9, -56.16))
      await fireEvent.changeText(field(TEXTS.locationLabel), 'Cancha del campus')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      // El cupo está dentro de la tarjeta: se lleva la vista a la tarjeta.
      await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(2))
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 1080 - SCROLL_MARGIN, animated: true })
    })

    it('el costo, dentro de la tarjeta de cupo, suma la posición de la tarjeta', async () => {
      await renderScreen()
      await screen.findByRole('checkbox', { name: 'Fútbol' })
      await layout(wrapperOf(screen.getByRole('switch', { name: TEXTS.unlimited })), 1080, 300)
      await layout(wrapperOf(field(TEXTS.price)), 200)
      await fillValid()
      await fireEvent.changeText(field(TEXTS.price), '')

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 1080 + 200 - SCROLL_MARGIN, animated: true }))
      expect(screen.getByText('Costo.')).toBeOnTheScreen()
      expect(plansApi.createPlan).not.toHaveBeenCalled()
    })

    it('marca los obligatorios con un asterisco oculto al lector, sin cambiar cómo se encuentra cada campo', async () => {
      await renderScreen()
      await screen.findByRole('checkbox', { name: 'Fútbol' })

      expect(screen.getByText(TEXTS.requiredLegend)).toBeOnTheScreen()
      for (const label of [TEXTS.title, TEXTS.locationLabel, TEXTS.capacity, TEXTS.price]) {
        expect(screen.getAllByLabelText(label)).toHaveLength(1)
        expect(asterisks(formFieldOf(field(label)))).toHaveLength(1)
        expect(field(label).props.accessibilityHint).toMatch(new RegExp(`^${REQUIRED_HINT}`))
      }
      for (const label of [TEXTS.startsAt, TEXTS.endsAt]) {
        const button = screen.getByRole('button', { name: label })
        expect(asterisks(button.parent)).toHaveLength(1)
        expect(button.props.accessibilityHint).toMatch(new RegExp(`^${REQUIRED_HINT}`))
      }
      // El asterisco no se lee: solo aparece incluyendo lo oculto.
      expect(screen.queryAllByText('*')).toHaveLength(0)
      expect(screen.getByRole('header', { name: 'Lugar, obligatorio' })).toBeOnTheScreen()
      expect(screen.getByRole('header', { name: 'Tipo de actividad, obligatorio' })).toBeOnTheScreen()

      // Descripción es opcional: sin asterisco y con la ayuda de siempre.
      expect(asterisks(formFieldOf(field(TEXTS.description)))).toHaveLength(0)
      expect(field(TEXTS.description).props.accessibilityHint).toBe(TEXTS.descriptionHint)
    })

    it('el cupo solo lleva asterisco cuando no es ilimitado (con ilimitado el campo no está)', async () => {
      await renderScreen()
      await screen.findByRole('checkbox', { name: 'Fútbol' })
      const total = () => screen.queryAllByText('*', { includeHiddenElements: true }).length
      const withCapacity = total()

      await fireEvent(screen.getByRole('switch', { name: TEXTS.unlimited }), 'valueChange', true)

      expect(screen.queryByLabelText(TEXTS.capacity)).not.toBeOnTheScreen()
      expect(total()).toBe(withCapacity - 1)
    })

    it('el hint de un obligatorio con error dice "Obligatorio" y el error', async () => {
      await renderScreen()
      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.create }))

      expect(field(TEXTS.locationLabel).props.accessibilityHint).toBe(`${REQUIRED_HINT}. Ingresá el nombre del lugar.`)
      expect(screen.getByRole('button', { name: TEXTS.endsAt }).props.accessibilityHint).toContain('Elegí cuándo termina.')
    })

    it('doble toque mientras guarda: un solo request', async () => {
      const pending = deferred()
      plansApi.createPlan.mockReturnValue(pending.promise)
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillValid()

      const press = onPressOf(screen.getByRole('button', { name: TEXTS.create }))
      await act(async () => {
        press()
        press()
      })

      expect(plansApi.createPlan).toHaveBeenCalledTimes(1)
      await act(async () => pending.resolve(PLAN))
      expect(navigation.navigate).toHaveBeenCalledTimes(1)
      expect(announce).toHaveBeenCalledWith(TEXTS.created)
    })

    it('error del servidor en una ruta de array (interests.0) se muestra en Tipo de actividad, con cartel', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ path: 'interests.0', message: 'Ese tipo de actividad no existe.' }]
      }))
      await renderScreen()
      await screen.findByRole('checkbox', { name: 'Fútbol' })
      await layout(wrapperOf(screen.getByRole('checkbox', { name: 'Fútbol' })), 1400, 300)
      await fillValid()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      expect(await screen.findByText('Ese tipo de actividad no existe.')).toBeOnTheScreen()
      expect(screen.getByText('Revisá este dato')).toBeOnTheScreen()
      expect(screen.getByText('Tipo de actividad.')).toBeOnTheScreen()
      expect(screen.queryByText(TEXTS.createErrorTitle)).not.toBeOnTheScreen()
      expect(announce).toHaveBeenCalledWith('Revisá este dato: Tipo de actividad.')
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 1400 - SCROLL_MARGIN, animated: true }))
    })

    it('error del servidor en un campo que el formulario no tiene: aviso general, nunca silencio', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Hay datos inválidos en la solicitud.',
        details: [{ path: 'creatorId', message: 'No se permite.' }]
      }))
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillValid()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await screen.findByText(TEXTS.createErrorTitle)
      const alert = alertWith(TEXTS.createErrorTitle)
      expect(within(alert).getByText(TEXTS.createErrorTitle)).toBeOnTheScreen()
      expect(within(alert).getByText('Hay datos inválidos en la solicitud.')).toBeOnTheScreen()
      expect(screen.queryByText(/^Revisá/)).not.toBeOnTheScreen()
      expect(announce).toHaveBeenCalledWith(`${TEXTS.createErrorTitle} Hay datos inválidos en la solicitud.`)
    })

    it('un campo conocido y uno desconocido: se muestran los dos (en el campo y como aviso general)', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ path: 'title', message: 'Ese título no va.' }, { path: 'status', message: 'No se permite.' }]
      }))
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillValid()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      expect(await screen.findByText('Ese título no va.')).toBeOnTheScreen()
      expect(screen.getByText('Revisá este dato')).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.createErrorTitle)).toBeOnTheScreen()
    })

    it('500: aviso general en el footer con el título y el botón vuelve a estar disponible', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL' }))
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillValid()

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await screen.findByText(TEXTS.createErrorTitle)
      const alert = alertWith(TEXTS.createErrorTitle)
      expect(within(alert).getByText(TEXTS.createErrorTitle)).toBeOnTheScreen()
      expect(within(alert).getByText(/error en el servidor/)).toBeOnTheScreen()
      expect(screen.getByRole('button', { name: TEXTS.create })).toBeEnabled()
      expect(announce).toHaveBeenCalledWith(expect.stringContaining(TEXTS.createErrorTitle))
      expect(scrollTo).not.toHaveBeenCalled()
    })

    it('sin conexión en Android: aviso con título; lo anuncia la región viva (no se anuncia dos veces)', async () => {
      plansApi.createPlan.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderScreen()
      await screen.findByRole('button', { name: TEXTS.create })
      await fillValid()
      jest.replaceProperty(Platform, 'OS', 'android')

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.create }))

      await screen.findByText(TEXTS.createErrorTitle)
      const alert = alertWith(TEXTS.createErrorTitle)
      expect(within(alert).getByText(TEXTS.createErrorTitle)).toBeOnTheScreen()
      expect(within(alert).getByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(alert.props.accessibilityLiveRegion).toBe('polite')
      expect(announce).not.toHaveBeenCalled()
    })

    it('editar sin cambios vuelve al detalle sin llamar a la API ni mostrar avisos', async () => {
      await renderScreen({ plan: PLAN })

      await fireEvent.press(await screen.findByRole('button', { name: TEXTS.save }))

      expect(navigation.popTo).toHaveBeenCalledWith('Plan', { planId: 'p1', version: expect.any(Number) })
      expect(plansApi.updatePlan).not.toHaveBeenCalled()
      expect(screen.queryByText(/^Revisá/)).not.toBeOnTheScreen()
      expect(announce).not.toHaveBeenCalled()
    })

    it('editar: 409 por cupo muestra el cartel "Cupo." y lleva la vista a la tarjeta del cupo', async () => {
      plansApi.updatePlan.mockRejectedValue(new ApiError({ status: 409, code: 'CAPACITY_BELOW_PARTICIPANTS', message: 'El cupo no puede ser menor que los 4 inscriptos' }))
      await renderScreen({ plan: PLAN })
      await layout(wrapperOf(await screen.findByRole('switch', { name: TEXTS.unlimited })), 1080, 300)

      await fireEvent.changeText(field(TEXTS.capacity), '3')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.save }))

      expect(await screen.findByText('El cupo no puede ser menor que los 4 inscriptos')).toBeOnTheScreen()
      expect(screen.getByText('Revisá este dato')).toBeOnTheScreen()
      expect(screen.getByText('Cupo.')).toBeOnTheScreen()
      expect(screen.queryByText(TEXTS.saveErrorTitle)).not.toBeOnTheScreen()
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ y: 1080 - SCROLL_MARGIN, animated: true }))
    })

    it('editar: un error general usa el título de guardar', async () => {
      plansApi.updatePlan.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderScreen({ plan: PLAN })

      await fireEvent.changeText(await screen.findByLabelText(TEXTS.title), 'Fútbol 5 mixto')
      await fireEvent.press(screen.getByRole('button', { name: TEXTS.save }))

      expect(await screen.findByText(TEXTS.saveErrorTitle)).toBeOnTheScreen()
      expect(announce).toHaveBeenCalledWith(expect.stringContaining(TEXTS.saveErrorTitle))
    })
  })
})
