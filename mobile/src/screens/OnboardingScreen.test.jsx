import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { CATALOG, SignedIn, USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { resetCatalogsCache } from '../hooks/useCatalogs.js'
import { getCatalogs } from '../services/api/catalogs.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import * as usersApi from '../services/api/users.js'
import { pickProfileImage } from '../services/imagePicker.js'
import { uploadProfilePhoto } from '../services/photoUpload.js'
import OnboardingScreen, { TEXTS } from './OnboardingScreen.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/catalogs.js', () => ({ getCatalogs: jest.fn() }))
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))
jest.mock('../services/imagePicker.js', () => ({ pickProfileImage: jest.fn() }))
jest.mock('../services/photoUpload.js', () => ({ uploadProfilePhoto: jest.fn() }))

async function renderOnboarding (user = USER) {
  const view = await renderWithAuth(<SignedIn><OnboardingScreen /></SignedIn>, { service: createFakeAuthService({ user }) })
  await screen.findByRole('header', { name: 'Contanos sobre vos' })
  return view
}

const press = (name) => fireEvent.press(screen.getByRole('button', { name }))
const button = (name) => screen.getByRole('button', { name })
const queryButton = (name) => screen.queryByRole('button', { name })

async function choose (label, option) {
  await press(label)
  await press(option)
}

async function pickBirthDate (date) {
  await press(TEXTS.birthDate)
  await act(async () => screen.getByTestId('birth-date-picker').props.onValueChange({}, date))
}

// Pasa al paso 2 y al 3 sin cargar nada.
async function goTo (step) {
  for (let i = 1; i < step; i++) await press(TEXTS.next)
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    resetCatalogsCache()
    getCatalogs.mockReset()
    getCatalogs.mockResolvedValue(CATALOG)
    usersApi.updateMe.mockReset()
    usersApi.updateMe.mockImplementation(async (changes) => ({ ...USER, ...changes, onboardingCompleted: Boolean(changes.onboardingCompleted) }))
    pickProfileImage.mockReset()
    uploadProfilePhoto.mockReset()
  })

  afterEach(() => jest.restoreAllMocks())

  describe('estructura', () => {
    it('muestra "Paso 1 de 3" con la barra de progreso, el título y todo opcional', async () => {
      await renderOnboarding()

      expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen()
      expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 1 })
      expect(screen.getByText(TEXTS.aboutHint)).toBeOnTheScreen()
    })

    it('en cada paso se puede avanzar, saltar o dejarlo para más tarde', async () => {
      await renderOnboarding()

      expect(button(TEXTS.next)).toBeEnabled()
      expect(button(TEXTS.skip)).toBeEnabled()
      expect(button(TEXTS.later)).toBeEnabled()
      expect(queryButton(TEXTS.back)).not.toBeOnTheScreen() // en el primer paso no hay "Atrás"
    })

    it('el último paso dice "Finalizar" en lugar de "Siguiente"', async () => {
      await renderOnboarding()

      await goTo(3)

      expect(screen.getByText('Paso 3 de 3')).toBeOnTheScreen()
      expect(button(TEXTS.finish)).toBeOnTheScreen()
      expect(queryButton(TEXTS.next)).not.toBeOnTheScreen()
    })
  })

  describe('navegación entre pasos', () => {
    it('"Siguiente" sin haber cargado nada avanza sin llamar a la API', async () => {
      await renderOnboarding()

      await press(TEXTS.next)

      expect(screen.getByRole('header', { name: 'Estudios y zona' })).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
    })

    it('"Saltar este paso" avanza sin guardar aunque haya algo elegido', async () => {
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))

      await press(TEXTS.skip)

      expect(screen.getByRole('header', { name: 'Estudios y zona' })).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
    })

    it('"Atrás" vuelve al paso anterior y conserva lo elegido', async () => {
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))
      await press(TEXTS.next)

      await press(TEXTS.back)

      expect(screen.getByRole('header', { name: 'Contanos sobre vos' })).toBeOnTheScreen()
      expect(screen.getByText('09/03/2001')).toBeOnTheScreen()
    })
  })

  describe('paso 1: fecha de nacimiento y foto', () => {
    it('guarda la fecha como YYYY-MM-DD (día local) al avanzar', async () => {
      await renderOnboarding()
      await pickBirthDate(new Date(1999, 4, 14, 23, 30))

      await press(TEXTS.next)

      expect(usersApi.updateMe).toHaveBeenCalledWith({ birthDate: '1999-05-14' })
      expect(await screen.findByRole('header', { name: 'Estudios y zona' })).toBeOnTheScreen()
    })

    it('valida en el teléfono: una fecha futura no se manda', async () => {
      await renderOnboarding()
      const future = new Date()
      future.setFullYear(future.getFullYear() + 1)
      await pickBirthDate(future)

      await press(TEXTS.next)

      expect(screen.getByText('La fecha de nacimiento no puede ser futura.')).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
      expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen()
    })

    it('un menor de 16 años no pasa', async () => {
      await renderOnboarding()
      const now = new Date()
      await pickBirthDate(new Date(now.getFullYear() - 10, 0, 1, 12))

      await press(TEXTS.next)

      expect(screen.getByText(/entre 16 y 100/)).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
    })

    it('se puede elegir la foto desde el primer paso', async () => {
      pickProfileImage.mockResolvedValue({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' })
      uploadProfilePhoto.mockResolvedValue({ ...USER, photoUrl: 'https://s3.example/foto.jpg?firma' })
      await renderOnboarding()

      await press(TEXTS.photo)

      expect((await screen.findByLabelText('Foto de perfil')).props.source).toEqual([expect.objectContaining({ uri: 'https://s3.example/foto.jpg?firma' })])
      expect(button(TEXTS.changePhoto)).toBeOnTheScreen()
    })
  })

  describe('paso 2: estudios y zona', () => {
    it('la carrera y el barrio están deshabilitados hasta elegir universidad y ciudad', async () => {
      await renderOnboarding()
      await goTo(2)

      expect(await screen.findByRole('button', { name: TEXTS.university })).toBeEnabled()
      expect(button(TEXTS.career)).toBeDisabled()
      expect(button(TEXTS.neighborhood)).toBeDisabled()
      expect(screen.getByText(TEXTS.careerHintNoUniversity)).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.neighborhoodHintNoCity)).toBeOnTheScreen()
    })

    it('al elegir la universidad se ofrecen SUS carreras', async () => {
      await renderOnboarding()
      await goTo(2)
      await screen.findByRole('button', { name: TEXTS.university })

      await choose(TEXTS.university, 'Universidad ORT Uruguay (ORT)')
      await press(TEXTS.career)

      expect(button('Ingeniería en Sistemas')).toBeOnTheScreen()
      expect(queryButton('Ingeniería en Informática')).not.toBeOnTheScreen() // esa es de la UM
    })

    it('guarda universidad, carrera, ciudad y barrio como keys al avanzar', async () => {
      await renderOnboarding()
      await goTo(2)
      await screen.findByRole('button', { name: TEXTS.university })

      await choose(TEXTS.university, 'Universidad de Montevideo (UM)')
      await choose(TEXTS.career, 'Economía')
      await choose(TEXTS.city, 'Montevideo')
      await choose(TEXTS.neighborhood, 'Cordón')
      await press(TEXTS.next)

      expect(usersApi.updateMe).toHaveBeenCalledWith({ university: 'um', career: 'economia', city: 'montevideo', neighborhood: 'cordon' })
      expect(await screen.findByRole('header', { name: '¿Qué te gusta hacer?' })).toBeOnTheScreen()
    })

    it('"Otra" universidad se guarda como other y no deja elegir carrera', async () => {
      await renderOnboarding()
      await goTo(2)
      await screen.findByRole('button', { name: TEXTS.university })

      await choose(TEXTS.university, 'Otra')

      expect(button(TEXTS.career)).toBeDisabled()
      expect(screen.getByText(TEXTS.careerHintOther)).toBeOnTheScreen()
      await press(TEXTS.next)
      expect(usersApi.updateMe).toHaveBeenCalledWith({ university: 'other' })
    })

    it('"Otra" ciudad se guarda como other y no deja elegir barrio', async () => {
      await renderOnboarding()
      await goTo(2)
      await screen.findByRole('button', { name: TEXTS.university })

      await choose(TEXTS.city, 'Otra')

      expect(button(TEXTS.neighborhood)).toBeDisabled()
      expect(screen.getByText(TEXTS.neighborhoodHintOther)).toBeOnTheScreen()
    })

    it('cambiar la universidad vacía la carrera ya elegida', async () => {
      await renderOnboarding()
      await goTo(2)
      await screen.findByRole('button', { name: TEXTS.university })
      await choose(TEXTS.university, 'Universidad de Montevideo (UM)')
      await choose(TEXTS.career, 'Economía')

      await choose(TEXTS.university, 'Universidad ORT Uruguay (ORT)')

      expect(screen.queryByText('Economía')).not.toBeOnTheScreen()
    })

    it('si los catálogos no cargan avisa y permite reintentar; el paso 1 no dependía de ellos', async () => {
      getCatalogs.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderOnboarding()
      await goTo(2)

      expect(await screen.findByText('No pudimos cargar las opciones.')).toBeOnTheScreen()
      await press('Reintentar')

      expect(await screen.findByRole('button', { name: TEXTS.university })).toBeOnTheScreen()
    })
  })

  describe('paso 3: intereses', () => {
    it('muestra los intereses por categoría y cuenta los elegidos', async () => {
      await renderOnboarding()
      await goTo(3)

      expect(await screen.findByRole('header', { name: 'Deportes' })).toBeOnTheScreen()
      expect(screen.getByText(TEXTS.interestsCount(0))).toBeOnTheScreen()

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Pádel' }))
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Cine' }))

      expect(screen.getByText(TEXTS.interestsCount(2))).toBeOnTheScreen()
    })

    it('sin fecha de nacimiento no se ofrecen las opciones con edad mínima', async () => {
      await renderOnboarding()
      await goTo(3)
      await screen.findByRole('header', { name: 'Deportes' })

      expect(screen.queryByRole('checkbox', { name: 'Bares y cervecerías' })).not.toBeOnTheScreen()
    })

    it('con una fecha de nacimiento de mayor de 18 sí se ofrecen', async () => {
      await renderOnboarding()
      await pickBirthDate(new Date(2000, 0, 1, 12))
      await press(TEXTS.next)
      await press(TEXTS.next)

      expect(await screen.findByRole('checkbox', { name: 'Bares y cervecerías' })).toBeOnTheScreen()
    })

    it('"Finalizar" guarda los intereses y marca el onboarding como hecho, en el mismo pedido', async () => {
      await renderOnboarding()
      await goTo(3)
      await screen.findByRole('header', { name: 'Deportes' })
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Fútbol' }))
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Cine' }))

      await press(TEXTS.finish)

      expect(usersApi.updateMe).toHaveBeenCalledWith({ interests: ['futbol', 'cine'], onboardingCompleted: true })
    })

    it('"Finalizar" sin elegir nada igual termina el onboarding', async () => {
      await renderOnboarding()
      await goTo(3)

      await press(TEXTS.finish)

      expect(usersApi.updateMe).toHaveBeenCalledWith({ onboardingCompleted: true })
    })

    it('"Saltar este paso" en el último termina el onboarding sin guardar los intereses', async () => {
      await renderOnboarding()
      await goTo(3)
      await screen.findByRole('header', { name: 'Deportes' })
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Fútbol' }))

      await press(TEXTS.skip)

      expect(usersApi.updateMe).toHaveBeenCalledWith({ onboardingCompleted: true })
    })
  })

  describe('"Más tarde"', () => {
    it('sale del onboarding desde cualquier paso, sin guardar lo del paso actual', async () => {
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))

      await press(TEXTS.later)

      expect(usersApi.updateMe).toHaveBeenCalledTimes(1)
      expect(usersApi.updateMe).toHaveBeenCalledWith({ onboardingCompleted: true })
    })

    it('si no hay conexión avisa y se puede reintentar', async () => {
      usersApi.updateMe.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderOnboarding()

      await press(TEXTS.later)
      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      await press(TEXTS.later)

      expect(usersApi.updateMe).toHaveBeenCalledTimes(2)
    })
  })

  describe('errores y carga', () => {
    it('un error de red al avanzar no cambia de paso y conserva lo elegido', async () => {
      usersApi.updateMe.mockRejectedValueOnce(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))

      await press(TEXTS.next)

      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen()
      expect(screen.getByText('09/03/2001')).toBeOnTheScreen()
      await press(TEXTS.next)
      expect(await screen.findByRole('header', { name: 'Estudios y zona' })).toBeOnTheScreen()
    })

    it('un VALIDATION_ERROR del servidor se muestra junto al campo', async () => {
      usersApi.updateMe.mockRejectedValueOnce(new ApiError({
        status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'birthDate', message: 'Fecha rechazada por el servidor' }]
      }))
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))

      await press(TEXTS.next)

      expect(await screen.findByText('Fecha rechazada por el servidor')).toBeOnTheScreen()
      expect(screen.getByText('Paso 1 de 3')).toBeOnTheScreen()
    })

    it('mientras guarda deshabilita todos los botones', async () => {
      const pending = deferred()
      usersApi.updateMe.mockReturnValue(pending.promise)
      await renderOnboarding()
      await pickBirthDate(new Date(2001, 2, 9, 12))

      await press(TEXTS.next)

      expect(button(TEXTS.next)).toBeDisabled()
      expect(button(TEXTS.skip)).toBeDisabled()
      expect(button(TEXTS.later)).toBeDisabled()
      await act(async () => pending.resolve({ ...USER, birthDate: '2001-03-09' }))
    })
  })
})
