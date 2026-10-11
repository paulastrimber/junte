import { act, fireEvent, screen } from '@testing-library/react-native'

import { createFakeAuthService, renderWithAuth } from '../../tests/helpers/auth.jsx'
import { deferred } from '../../tests/helpers/deferred.js'
import { ApiError } from '../services/api/errors.js'
import RegisterScreen, { TEXTS } from './RegisterScreen.jsx'

const navigation = { navigate: jest.fn() }

async function renderRegister (service = createFakeAuthService()) {
  const view = await renderWithAuth(<RegisterScreen navigation={navigation} />, { service })
  await screen.findByText(TEXTS.title)
  return view
}

async function fill ({ name = 'Ana', email = 'ana@um.edu.uy', password = 'secreto-123' } = {}) {
  await fireEvent.changeText(screen.getByLabelText(TEXTS.name), name)
  await fireEvent.changeText(screen.getByLabelText(TEXTS.email), email)
  await fireEvent.changeText(screen.getByLabelText(TEXTS.password), password)
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: TEXTS.submit }))

describe('RegisterScreen', () => {
  beforeEach(() => navigation.navigate.mockReset())

  it('valida nombre, email y contraseña (mínimo 8) antes de llamar al servicio', async () => {
    const { service } = await renderRegister()

    await submit()
    expect(screen.getByText('Ingresá tu nombre.')).toBeOnTheScreen()
    expect(screen.getByText('Ingresá tu email.')).toBeOnTheScreen()
    expect(screen.getByText('Ingresá tu contraseña.')).toBeOnTheScreen()

    await fill({ password: '1234567' })
    await submit()
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeOnTheScreen()
    expect(service.register).not.toHaveBeenCalled()
  })

  it('registra con los datos recortados', async () => {
    const { service } = await renderRegister()
    await fill({ name: '  Ana María ', email: ' ana@um.edu.uy ' })

    await submit()

    expect(service.register).toHaveBeenCalledWith({ name: 'Ana María', email: 'ana@um.edu.uy', password: 'secreto-123' })
  })

  it('mientras envía muestra el estado de carga y bloquea los campos', async () => {
    const pending = deferred()
    const service = createFakeAuthService({ register: jest.fn(() => pending.promise) })
    await renderRegister(service)
    await fill()

    await submit()

    expect(screen.getByRole('button', { name: TEXTS.submit })).toBeDisabled()
    expect(screen.getByLabelText(TEXTS.email).props.editable).toBe(false)
    await act(async () => pending.resolve({}))
  })

  it('EMAIL_TAKEN se muestra junto al campo email', async () => {
    const service = createFakeAuthService({ register: jest.fn().mockRejectedValue(new ApiError({ status: 409, code: 'EMAIL_TAKEN' })) })
    await renderRegister(service)
    await fill()

    await submit()

    expect(await screen.findByText('Ya existe una cuenta con ese email.')).toBeOnTheScreen()
  })

  it('un VALIDATION_ERROR del servidor muestra cada detalle en su campo', async () => {
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'email', message: 'Correo inválido (servidor)' }, { path: 'name', message: 'Nombre inválido (servidor)' }]
    })
    await renderRegister(createFakeAuthService({ register: jest.fn().mockRejectedValue(error) }))
    await fill()

    await submit()

    expect(await screen.findByText('Correo inválido (servidor)')).toBeOnTheScreen()
    expect(screen.getByText('Nombre inválido (servidor)')).toBeOnTheScreen()
  })

  it('un error de red se muestra como error del formulario y se puede reintentar', async () => {
    const register = jest.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK_ERROR' })).mockResolvedValueOnce({})
    await renderRegister(createFakeAuthService({ register }))
    await fill()

    await submit()
    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()

    await submit()
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('el botón "Ya tengo cuenta" lleva al login', async () => {
    await renderRegister()

    await fireEvent.press(screen.getByRole('button', { name: TEXTS.login }))

    expect(navigation.navigate).toHaveBeenCalledWith('Login')
  })
})
