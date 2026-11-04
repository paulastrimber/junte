import { act, fireEvent, screen } from '@testing-library/react-native'

import { createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { PASSWORD_TOGGLE } from '../components/FormField.jsx'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import LoginScreen, { TEXTS } from './LoginScreen.jsx'

const navigation = { navigate: jest.fn() }

async function renderLogin (service = createFakeAuthService()) {
  const view = await renderWithAuth(<LoginScreen navigation={navigation} />, { service })
  // Espera a que el AuthProvider termine de restaurar la sesión (signedOut).
  await screen.findByText(TEXTS.title)
  return view
}

async function fill (email, password) {
  await fireEvent.changeText(screen.getByLabelText(TEXTS.email), email)
  await fireEvent.changeText(screen.getByLabelText(TEXTS.password), password)
}

describe('LoginScreen', () => {
  beforeEach(() => navigation.navigate.mockReset())

  it('muestra los campos y los dos botones', async () => {
    await renderLogin()

    expect(screen.getByLabelText(TEXTS.email)).toBeOnTheScreen()
    expect(screen.getByLabelText(TEXTS.password)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.submit })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.register })).toBeOnTheScreen()
  })

  it('muestra la marca y un único título de pantalla', async () => {
    await renderLogin()

    expect(screen.getByLabelText('junte')).toBeOnTheScreen()
    expect(screen.getByRole('header', { name: TEXTS.title })).toBeOnTheScreen()
    expect(screen.getByText(TEXTS.subtitle)).toBeOnTheScreen()
  })

  it('la contraseña se oculta mientras se escribe', async () => {
    await renderLogin()

    expect(screen.getByLabelText(TEXTS.password).props.secureTextEntry).toBe(true)
  })

  it('el ojo muestra y vuelve a ocultar la contraseña sin borrar lo escrito', async () => {
    await renderLogin()
    await fill('ana@um.edu.uy', 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: PASSWORD_TOGGLE.show }))

    expect(screen.getByLabelText(TEXTS.password).props.secureTextEntry).toBe(false)
    expect(screen.getByLabelText(TEXTS.password).props.value).toBe('secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: PASSWORD_TOGGLE.hide }))

    expect(screen.getByLabelText(TEXTS.password).props.secureTextEntry).toBe(true)
    expect(screen.getByLabelText(TEXTS.password).props.value).toBe('secreto-123')
  })

  it('valida en el teléfono: campos vacíos muestran errores y no llaman al servicio', async () => {
    const { service } = await renderLogin()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(screen.getByText('Ingresá tu email.')).toBeOnTheScreen()
    expect(screen.getByText('Ingresá tu contraseña.')).toBeOnTheScreen()
    expect(service.login).not.toHaveBeenCalled()
  })

  it('un email mal formado muestra el error junto al campo', async () => {
    const { service } = await renderLogin()
    await fill('ana@', 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(screen.getByText('Ingresá un email válido.')).toBeOnTheScreen()
    expect(service.login).not.toHaveBeenCalled()
  })

  it('escribir en un campo borra su error', async () => {
    await renderLogin()
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))
    expect(screen.getByText('Ingresá tu email.')).toBeOnTheScreen()

    await fireEvent.changeText(screen.getByLabelText(TEXTS.email), 'a')

    expect(screen.queryByText('Ingresá tu email.')).not.toBeOnTheScreen()
  })

  it('inicia sesión con el email recortado y la contraseña tal cual', async () => {
    const { service } = await renderLogin()
    await fill('  ana@um.edu.uy ', ' secreto 123 ')

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(service.login).toHaveBeenCalledWith({ email: 'ana@um.edu.uy', password: ' secreto 123 ' })
  })

  it('mientras envía deshabilita el botón y no permite un segundo envío', async () => {
    const pending = deferred()
    const service = createFakeAuthService({ login: jest.fn(() => pending.promise) })
    await renderLogin(service)
    await fill('ana@um.edu.uy', 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(screen.getByRole('button', { name: TEXTS.submit })).toBeDisabled()
    expect(service.login).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve({}))
  })

  it.each([
    ['INVALID_CREDENTIALS', 401, 'Email o contraseña incorrectos.'],
    ['ACCOUNT_SUSPENDED', 401, 'Tu cuenta está suspendida.'],
    ['RATE_LIMITED', 429, 'Demasiados intentos. Esperá un momento y probá de nuevo.'],
    [CLIENT_ERROR_CODES.NETWORK_ERROR, 0, 'No pudimos conectarnos con el servidor. Revisá tu conexión.']
  ])('error %s → mensaje según el code', async (code, status, text) => {
    const service = createFakeAuthService({ login: jest.fn().mockRejectedValue(new ApiError({ status, code, message: 'mensaje del servidor que no se usa' })) })
    await renderLogin(service)
    await fill('ana@um.edu.uy', 'secreto-123')

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(await screen.findByText(text)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.submit })).toBeEnabled()
  })

  it('después de un error se puede reintentar', async () => {
    const login = jest.fn().mockRejectedValueOnce(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' })).mockResolvedValueOnce({})
    await renderLogin(createFakeAuthService({ login }))
    await fill('ana@um.edu.uy', 'mala')
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))
    await screen.findByText('Email o contraseña incorrectos.')

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

    expect(login).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Email o contraseña incorrectos.')).not.toBeOnTheScreen()
  })

  it('explica por qué volvió al login cuando la sesión terminó sola', async () => {
    const service = createFakeAuthService()
    await renderLogin(service)

    await act(async () => service.expire(new ApiError({ status: 401, code: 'ACCOUNT_SUSPENDED' })))

    expect(screen.getByText('Tu cuenta está suspendida.')).toBeOnTheScreen()
    // Es un aviso, no un error del formulario: no se anuncia como alerta.
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen()
  })

  it('el botón de crear cuenta lleva al registro', async () => {
    await renderLogin()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.register }))

    expect(navigation.navigate).toHaveBeenCalledWith('Register')
  })
})
