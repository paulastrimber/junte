import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { RESEND_COOLDOWN_SECONDS } from '../hooks/useResetPasswordForm.js'
import { changePassword, forgotPassword, resetPassword } from '../services/api/auth.js'
import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import ChangePasswordScreen, { TEXTS as CHANGE } from './ChangePasswordScreen.jsx'
import ForgotPasswordScreen, { TEXTS as FORGOT } from './ForgotPasswordScreen.jsx'
import ResetPasswordScreen, { TEXTS as RESET } from './ResetPasswordScreen.jsx'

jest.mock('../services/api/auth.js', () => ({ forgotPassword: jest.fn(), resetPassword: jest.fn(), changePassword: jest.fn() }))

const EMAIL = 'ana@um.edu.uy'
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn() }
const networkError = () => new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR })
const button = (name) => screen.getByRole('button', { name })

beforeEach(() => {
  Object.values(navigation).forEach((mock) => mock.mockReset())
  forgotPassword.mockReset().mockResolvedValue(undefined)
  resetPassword.mockReset().mockResolvedValue(undefined)
  changePassword.mockReset().mockResolvedValue(undefined)
})

describe('ForgotPasswordScreen', () => {
  const renderForgot = (params) => render(<ForgotPasswordScreen navigation={navigation} route={{ params }} />)

  it('arranca con el email que la persona ya había escrito en el login', async () => {
    await renderForgot({ email: EMAIL })

    expect(screen.getByRole('header', { name: FORGOT.title })).toBeOnTheScreen()
    expect(screen.getByLabelText(FORGOT.email).props.value).toBe(EMAIL)
  })

  it('sin email o con uno inválido avisa en el campo y no llama al servidor', async () => {
    await renderForgot()

    await fireEvent.press(button(FORGOT.submit))
    expect(screen.getByText('Ingresá tu email.')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText(FORGOT.email), 'no-es-un-email')
    await fireEvent.press(button(FORGOT.submit))

    expect(screen.getByText('Ingresá un email válido.')).toBeOnTheScreen()
    expect(forgotPassword).not.toHaveBeenCalled()
  })

  it('pide el código (email sin espacios) y pasa a la pantalla del código con ese email', async () => {
    await renderForgot()

    await fireEvent.changeText(screen.getByLabelText(FORGOT.email), `  ${EMAIL} `)
    await fireEvent.press(button(FORGOT.submit))

    expect(forgotPassword).toHaveBeenCalledWith({ email: EMAIL })
    expect(navigation.navigate).toHaveBeenCalledWith('ResetPassword', { email: EMAIL })
  })

  it('mientras envía deshabilita el botón: tocar dos veces manda un solo pedido', async () => {
    const pending = deferred()
    forgotPassword.mockReturnValue(pending.promise)
    await renderForgot({ email: EMAIL })

    await fireEvent.press(button(FORGOT.submit))
    await fireEvent.press(button(FORGOT.submit))
    await act(async () => pending.resolve())

    expect(forgotPassword).toHaveBeenCalledTimes(1)
  })

  it('sin conexión o con demasiados intentos muestra el error y no avanza', async () => {
    forgotPassword.mockRejectedValueOnce(networkError()).mockRejectedValueOnce(new ApiError({ status: 429, code: 'RATE_LIMITED' }))
    await renderForgot({ email: EMAIL })

    await fireEvent.press(button(FORGOT.submit))
    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
    await fireEvent.press(button(FORGOT.submit))

    expect(await screen.findByText(/Demasiados intentos/)).toBeOnTheScreen()
    expect(navigation.navigate).not.toHaveBeenCalled()
  })

  it('"Volver a iniciar sesión" vuelve al login', async () => {
    await renderForgot()

    await fireEvent.press(button(FORGOT.back))

    expect(navigation.goBack).toHaveBeenCalled()
  })
})

describe('ResetPasswordScreen', () => {
  const renderReset = () => render(<ResetPasswordScreen navigation={navigation} route={{ params: { email: EMAIL } }} />)

  async function fill (code, password) {
    await fireEvent.changeText(screen.getByLabelText(RESET.code), code)
    await fireEvent.changeText(screen.getByLabelText(RESET.password), password)
  }

  it('explica a dónde fue el código sin afirmar que la cuenta existe', async () => {
    await renderReset()

    expect(screen.getByRole('header', { name: RESET.title })).toBeOnTheScreen()
    expect(screen.getByText(RESET.sent(EMAIL))).toBeOnTheScreen()
    expect(RESET.sent(EMAIL)).toMatch(/^Si ana@um\.edu\.uy tiene una cuenta/)
    expect(screen.getByLabelText(RESET.password).props.secureTextEntry).toBe(true)
  })

  it('valida en el teléfono: código de 6 dígitos y contraseña de al menos 8', async () => {
    await renderReset()

    await fireEvent.press(button(RESET.submit))
    expect(screen.getByText('Ingresá el código que te llegó por email.')).toBeOnTheScreen()
    expect(screen.getByText('Ingresá tu contraseña.')).toBeOnTheScreen()
    await fill('12345', 'corta')
    await fireEvent.press(button(RESET.submit))

    expect(screen.getByText('El código tiene 6 dígitos.')).toBeOnTheScreen()
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeOnTheScreen()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('con el cambio confirmado por el servidor vuelve al login con el email y el aviso', async () => {
    await renderReset()

    await fill(' 042137 ', 'clave-nueva-123')
    await fireEvent.press(button(RESET.submit))

    expect(resetPassword).toHaveBeenCalledWith({ email: EMAIL, code: '042137', newPassword: 'clave-nueva-123' })
    expect(navigation.popTo).toHaveBeenCalledWith('Login', { email: EMAIL, passwordResetAt: expect.any(Number) })
  })

  it('un código incorrecto o vencido se marca en el campo del código y no vuelve al login', async () => {
    resetPassword.mockRejectedValue(new ApiError({ status: 401, code: 'RESET_CODE_INVALID', message: 'x' }))
    await renderReset()

    await fill('000000', 'clave-nueva-123')
    await fireEvent.press(button(RESET.submit))

    expect(await screen.findByText('El código no es correcto o ya venció. Revisalo o pedí uno nuevo.')).toBeOnTheScreen()
    expect(navigation.popTo).not.toHaveBeenCalled()
    // Se puede corregir y volver a intentar.
    resetPassword.mockResolvedValue(undefined)
    await fireEvent.changeText(screen.getByLabelText(RESET.code), '042137')
    await fireEvent.press(button(RESET.submit))
    expect(navigation.popTo).toHaveBeenCalled()
  })

  it('los errores de validación del servidor van junto a su campo; los demás, como error del formulario', async () => {
    resetPassword
      .mockRejectedValueOnce(new ApiError({ status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'newPassword', message: 'Demasiado corta' }] }))
      .mockRejectedValueOnce(networkError())
    await renderReset()
    await fill('042137', 'clave-nueva-123')

    await fireEvent.press(button(RESET.submit))
    expect(await screen.findByText('Demasiado corta')).toBeOnTheScreen()
    await fireEvent.press(button(RESET.submit))

    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
  })

  describe('pedir otro código', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('no se ofrece hasta que pasa un minuto; después manda otro y vuelve a esperar', async () => {
      await renderReset()
      expect(button(RESET.resendIn(RESEND_COOLDOWN_SECONDS))).toBeDisabled()

      await act(async () => jest.advanceTimersByTimeAsync(30_000))
      expect(button(RESET.resendIn(30))).toBeDisabled()
      await fireEvent.press(button(RESET.resendIn(30)))
      expect(forgotPassword).not.toHaveBeenCalled()

      await act(async () => jest.advanceTimersByTimeAsync(30_000))
      await fireEvent.press(button(RESET.resend))

      expect(forgotPassword).toHaveBeenCalledWith({ email: EMAIL })
      expect(await screen.findByText(RESET.resent)).toBeOnTheScreen()
      expect(button(RESET.resendIn(RESEND_COOLDOWN_SECONDS))).toBeDisabled()
    })

    it('si pedir otro código falla, lo dice y se puede reintentar', async () => {
      forgotPassword.mockRejectedValueOnce(networkError())
      await renderReset()
      await act(async () => jest.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000))

      await fireEvent.press(button(RESET.resend))

      expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
      expect(screen.queryByText(RESET.resent)).not.toBeOnTheScreen()
      expect(button(RESET.resend)).toBeEnabled()
    })
  })
})

describe('ChangePasswordScreen', () => {
  const renderChange = () => render(<ChangePasswordScreen navigation={navigation} />)

  async function fill (current, next) {
    await fireEvent.changeText(screen.getByLabelText(CHANGE.current), current)
    await fireEvent.changeText(screen.getByLabelText(CHANGE.next), next)
  }

  it('avisa que se cierran las otras sesiones y oculta las dos contraseñas', async () => {
    await renderChange()

    expect(screen.getByText(CHANGE.intro)).toBeOnTheScreen()
    expect(screen.getByLabelText(CHANGE.current).props.secureTextEntry).toBe(true)
    expect(screen.getByLabelText(CHANGE.next).props.secureTextEntry).toBe(true)
  })

  it('valida en el teléfono: las dos obligatorias, la nueva de al menos 8 y distinta de la actual', async () => {
    await renderChange()

    await fireEvent.press(button(CHANGE.submit))
    expect(screen.getAllByText('Ingresá tu contraseña.')).toHaveLength(2)
    await fill('la-actual-123', 'corta')
    await fireEvent.press(button(CHANGE.submit))
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeOnTheScreen()
    await fill('la-actual-123', 'la-actual-123')
    await fireEvent.press(button(CHANGE.submit))

    expect(screen.getByText('La contraseña nueva tiene que ser distinta de la actual.')).toBeOnTheScreen()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('con el cambio confirmado muestra el aviso y deja volver al perfil', async () => {
    await renderChange()

    await fill('la-actual-123', 'clave-nueva-123')
    await fireEvent.press(button(CHANGE.submit))

    expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'la-actual-123', newPassword: 'clave-nueva-123' })
    expect(await screen.findByText(CHANGE.done)).toBeOnTheScreen()
    expect(screen.queryByLabelText(CHANGE.current)).not.toBeOnTheScreen()
    await fireEvent.press(button(CHANGE.back))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('si la contraseña actual no es correcta, el servidor lo dice y se marca en ese campo', async () => {
    changePassword.mockRejectedValue(new ApiError({
      status: 400, code: 'VALIDATION_ERROR', details: [{ path: 'currentPassword', message: 'La contraseña actual no es correcta' }]
    }))
    await renderChange()

    await fill('no-es-la-actual', 'clave-nueva-123')
    await fireEvent.press(button(CHANGE.submit))

    expect(await screen.findByText('La contraseña actual no es correcta')).toBeOnTheScreen()
    expect(screen.queryByText(CHANGE.done)).not.toBeOnTheScreen()
  })

  it('sin conexión muestra el error y no da el cambio por hecho', async () => {
    changePassword.mockRejectedValue(networkError())
    await renderChange()

    await fill('la-actual-123', 'clave-nueva-123')
    await fireEvent.press(button(CHANGE.submit))

    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen()
    expect(screen.queryByText(CHANGE.done)).not.toBeOnTheScreen()
  })
})
