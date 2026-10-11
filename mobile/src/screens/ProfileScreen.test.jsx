import { act, fireEvent, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { COMPLETE_USER, SignedIn, USER, createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import * as usersApi from '../services/api/users.js'
import { pickProfileImage } from '../services/imagePicker.js'
import { uploadProfilePhoto } from '../services/photoUpload.js'
import ProfileScreen, { TEXTS } from './ProfileScreen.jsx'

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: (props) => <View {...props} />, DateTimePickerAndroid: { open: jest.fn() } }
})
jest.mock('../services/api/users.js', () => ({ getMe: jest.fn(), updateMe: jest.fn(), setPhoto: jest.fn() }))
jest.mock('../services/imagePicker.js', () => ({ pickProfileImage: jest.fn() }))
jest.mock('../services/photoUpload.js', () => ({ uploadProfilePhoto: jest.fn() }))

const navigation = { navigate: jest.fn() }

async function renderProfile (user = USER, service = createFakeAuthService({ user })) {
  const view = await renderWithAuth(<SignedIn><ProfileScreen navigation={navigation} /></SignedIn>, { service })
  await screen.findByRole('button', { name: TEXTS.save })
  return view
}

const saveButton = () => screen.getByRole('button', { name: TEXTS.save })
const field = (label) => screen.getByLabelText(label)

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    navigation.navigate.mockReset()
    usersApi.updateMe.mockReset()
    pickProfileImage.mockReset()
    uploadProfilePhoto.mockReset()
  })

  afterEach(() => jest.restoreAllMocks())

  describe('datos', () => {
    it('muestra el email, la edad calculada por el servidor y los datos del perfil', async () => {
      await renderProfile(COMPLETE_USER)

      expect(screen.getByText(/ana@um.edu.uy/)).toBeOnTheScreen()
      expect(screen.getByText(`${TEXTS.age}: 25`)).toBeOnTheScreen()
      expect(field(TEXTS.name).props.value).toBe('Ana')
      expect(screen.getByText('09/03/2001')).toBeOnTheScreen()
      expect(field(TEXTS.neighborhood).props.value).toBe('Pocitos')
      expect(field(TEXTS.city).props.value).toBe('Montevideo')
      expect(screen.getByRole('checkbox', { name: 'Fútbol' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Running' })).not.toBeChecked()
    })

    it('la edad no es un campo editable', async () => {
      await renderProfile(COMPLETE_USER)

      expect(screen.queryByLabelText(TEXTS.age)).not.toBeOnTheScreen()
    })

    it('con perfil incompleto avisa qué falta; con perfil completo no', async () => {
      await renderProfile(USER)
      expect(screen.getByText(TEXTS.incomplete)).toBeOnTheScreen()
    })

    it('con perfil completo no muestra el aviso', async () => {
      await renderProfile(COMPLETE_USER)
      expect(screen.queryByText(TEXTS.incomplete)).not.toBeOnTheScreen()
    })

    it('sin edad (todavía sin fecha de nacimiento) no muestra la línea de edad', async () => {
      await renderProfile(USER)
      expect(screen.queryByText(new RegExp(`^${TEXTS.age}:`))).not.toBeOnTheScreen()
    })
  })

  describe('guardar', () => {
    it('el botón está deshabilitado mientras no haya cambios', async () => {
      await renderProfile(COMPLETE_USER)

      expect(saveButton()).toBeDisabled()
    })

    it('manda solo los campos que cambiaron y refleja el perfil actualizado', async () => {
      usersApi.updateMe.mockResolvedValue({ ...COMPLETE_USER, city: 'Canelones', neighborhood: 'Las Piedras' })
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.city), '  Canelones ')
      await fireEvent.changeText(field(TEXTS.neighborhood), 'Las Piedras')

      await fireEvent.press(saveButton())

      expect(usersApi.updateMe).toHaveBeenCalledWith({ city: 'Canelones', neighborhood: 'Las Piedras' })
      expect(await screen.findByText(TEXTS.saved)).toBeOnTheScreen()
      expect(saveButton()).toBeDisabled()
    })

    it('elegir la fecha de nacimiento manda YYYY-MM-DD', async () => {
      usersApi.updateMe.mockResolvedValue({ ...COMPLETE_USER, birthDate: '1999-05-14', age: 27 })
      await renderProfile(COMPLETE_USER)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.birthDate }))
      await act(async () => screen.getByTestId('birth-date-picker').props.onValueChange({}, new Date(1999, 4, 14, 23, 30)))
      await fireEvent.press(saveButton())

      expect(usersApi.updateMe).toHaveBeenCalledWith({ birthDate: '1999-05-14' })
      expect(await screen.findByText(`${TEXTS.age}: 27`)).toBeOnTheScreen()
    })

    it('los intereses admiten hasta 5: el sexto queda deshabilitado', async () => {
      await renderProfile(USER)
      for (const label of ['Fútbol', 'Running', 'Estudio', 'Música', 'Cine']) {
        await fireEvent.press(screen.getByRole('checkbox', { name: label }))
      }

      expect(screen.getByRole('checkbox', { name: 'Juegos de mesa' })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'Cine' })).toBeEnabled()
    })

    it('guardar intereses manda la lista completa', async () => {
      usersApi.updateMe.mockResolvedValue({ ...COMPLETE_USER, interests: ['futbol', 'cine', 'musica'] })
      await renderProfile(COMPLETE_USER)

      await fireEvent.press(screen.getByRole('checkbox', { name: 'Música' }))
      await fireEvent.press(saveButton())

      expect(usersApi.updateMe).toHaveBeenCalledWith({ interests: ['futbol', 'cine', 'musica'] })
    })

    it('valida en el teléfono: nombre vacío no llama a la API', async () => {
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.name), '   ')

      await fireEvent.press(saveButton())

      expect(screen.getByText('Ingresá tu nombre.')).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
    })

    it('un dato opcional ya guardado no se puede dejar vacío (todavía no hay forma de borrarlo)', async () => {
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.neighborhood), '')

      await fireEvent.press(saveButton())

      expect(screen.getByText(/no se puede borrar/i)).toBeOnTheScreen()
      expect(usersApi.updateMe).not.toHaveBeenCalled()
    })

    it('un VALIDATION_ERROR del servidor se muestra en el campo que corresponde', async () => {
      usersApi.updateMe.mockRejectedValue(new ApiError({
        status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'city', message: 'La localidad es demasiado larga (servidor)' }]
      }))
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.city), 'Otra')

      await fireEvent.press(saveButton())

      expect(await screen.findByText('La localidad es demasiado larga (servidor)')).toBeOnTheScreen()
    })

    it('un error de red se muestra como error general y conserva lo escrito', async () => {
      usersApi.updateMe.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.city), 'Otra')

      await fireEvent.press(saveButton())

      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(field(TEXTS.city).props.value).toBe('Otra')
      expect(saveButton()).toBeEnabled()
    })

    it('mientras guarda deshabilita el botón', async () => {
      const pending = deferred()
      usersApi.updateMe.mockReturnValue(pending.promise)
      await renderProfile(COMPLETE_USER)
      await fireEvent.changeText(field(TEXTS.city), 'Otra')

      await fireEvent.press(saveButton())

      expect(saveButton()).toBeDisabled()
      await act(async () => pending.resolve({ ...COMPLETE_USER, city: 'Otra' }))
    })
  })

  describe('foto', () => {
    const changePhoto = () => fireEvent.press(screen.getByRole('button', { name: TEXTS.changePhoto }))

    it('elige, sube y muestra la foto nueva', async () => {
      const asset = { uri: 'file:///a.jpg', mimeType: 'image/jpeg' }
      pickProfileImage.mockResolvedValue(asset)
      uploadProfilePhoto.mockResolvedValue({ ...COMPLETE_USER, photoUrl: 'https://s3.example/foto.jpg?firma' })
      await renderProfile(COMPLETE_USER)

      await changePhoto()

      expect(uploadProfilePhoto).toHaveBeenCalledWith(asset)
      expect((await screen.findByLabelText('Foto de perfil')).props.source).toEqual({ uri: 'https://s3.example/foto.jpg?firma' })
    })

    it('si cancela la selección no sube nada ni muestra error', async () => {
      pickProfileImage.mockResolvedValue(null)
      await renderProfile(COMPLETE_USER)

      await changePhoto()

      expect(uploadProfilePhoto).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen()
    })

    it('mientras sube muestra el estado y deshabilita el botón', async () => {
      const pending = deferred()
      pickProfileImage.mockResolvedValue({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' })
      uploadProfilePhoto.mockReturnValue(pending.promise)
      await renderProfile(COMPLETE_USER)

      await changePhoto()

      expect(screen.getByRole('button', { name: TEXTS.uploadingPhoto })).toBeDisabled()
      await act(async () => pending.resolve(COMPLETE_USER))
      expect(screen.getByRole('button', { name: TEXTS.changePhoto })).toBeEnabled()
    })

    it.each([
      [CLIENT_ERROR_CODES.IMAGE_TOO_LARGE, 'La imagen pesa más de 5 MB. Elegí una más liviana.'],
      [CLIENT_ERROR_CODES.IMAGE_NOT_SUPPORTED, 'Elegí una imagen JPEG, PNG o WebP.'],
      [CLIENT_ERROR_CODES.UPLOAD_FAILED, 'No pudimos subir la foto. Probá de nuevo.']
    ])('error %s → mensaje claro', async (code, text) => {
      pickProfileImage.mockResolvedValue({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' })
      uploadProfilePhoto.mockRejectedValue(new ApiError({ status: 0, code }))
      await renderProfile(COMPLETE_USER)

      await changePhoto()

      expect(await screen.findByText(text)).toBeOnTheScreen()
    })

    it('sin foto muestra la inicial del nombre', async () => {
      await renderProfile(COMPLETE_USER)

      expect(screen.getByText('A')).toBeOnTheScreen()
    })
  })

  describe('sesión', () => {
    it('cerrar sesión llama al servicio', async () => {
      const { service } = await renderProfile(COMPLETE_USER)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.signOut }))

      expect(service.logout).toHaveBeenCalledTimes(1)
    })

    it('cerrar sesión en todos los dispositivos llama al servicio', async () => {
      const { service } = await renderProfile(COMPLETE_USER)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.signOutAll }))

      expect(service.logoutAll).toHaveBeenCalledTimes(1)
    })

    it('si el servidor no responde, "cerrar en todos" muestra el error y sigue con la sesión', async () => {
      const service = createFakeAuthService({
        user: COMPLETE_USER,
        logoutAll: jest.fn().mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
      })
      await renderProfile(COMPLETE_USER, service)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.signOutAll }))

      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(screen.getByRole('button', { name: TEXTS.save })).toBeOnTheScreen()
    })

    it('el botón de estado del servidor navega a Health', async () => {
      await renderProfile(COMPLETE_USER)

      await fireEvent.press(screen.getByRole('button', { name: TEXTS.health }))

      expect(navigation.navigate).toHaveBeenCalledWith('Health')
    })
  })
})
