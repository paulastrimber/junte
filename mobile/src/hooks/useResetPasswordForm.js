import { useEffect, useState } from 'react'

import { forgotPassword, resetPassword } from '../services/api/auth.js'
import { fieldErrorsFrom, messageForError, toViewError } from '../utils/errorMessages.js'
import { validatePassword, validateResetCode } from '../utils/validation.js'

/** El servidor manda como mucho un código por minuto: hasta entonces no se ofrece pedir otro. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Segundo paso de "olvidé mi contraseña": el código que llegó por email y la contraseña nueva.
 * La contraseña solo se da por cambiada cuando el servidor lo confirma; un código incorrecto o vencido se marca en su
 * campo. También permite pedir otro código, una vez por minuto.
 * @param {object} options
 * @param {string} options.email  La cuenta (viene del paso anterior).
 * @param {() => void} options.onDone  El servidor cambió la contraseña: se vuelve al login.
 */
export function useResetPasswordForm ({ email, onDone }) {
  const [values, setValues] = useState({ code: '', newPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [wasResent, setWasResent] = useState(false)
  // Arranca en cuenta regresiva: el código de este paso se pidió recién.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)

  // Un solo intervalo mientras dura la cuenta regresiva (no uno nuevo por segundo).
  const isCounting = secondsLeft > 0
  useEffect(() => {
    if (!isCounting) return undefined
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [isCounting])

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit () {
    if (isSubmitting) return
    const found = { code: validateResetCode(values.code), newPassword: validatePassword(values.newPassword) }
    if (found.code || found.newPassword) {
      setErrors(found)
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await resetPassword({ email, code: values.code.trim(), newPassword: values.newPassword })
      onDone()
    } catch (failure) {
      const fields = fieldErrorsFrom(failure)
      if (fields.code || fields.newPassword) {
        setErrors(fields)
      } else if (failure?.code === 'RESET_CODE_INVALID') {
        // Incorrecto, vencido o con demasiados intentos: es lo que la persona tiene que corregir (o pedir otro).
        setErrors({ code: messageForError(failure) })
      } else {
        setFormError(toViewError(failure))
      }
      setIsSubmitting(false)
    }
    // Si salió bien, la pantalla se desmonta (se vuelve al login): no hay estado que volver a tocar.
  }

  /** Pide otro código (el anterior deja de servir). Disponible cuando termina la cuenta regresiva. */
  async function resend () {
    if (isResending || secondsLeft > 0) return
    setIsResending(true)
    setFormError(null)
    setWasResent(false)
    try {
      await forgotPassword({ email })
      setWasResent(true)
      setSecondsLeft(RESEND_COOLDOWN_SECONDS)
    } catch (failure) {
      setFormError(toViewError(failure))
    } finally {
      setIsResending(false)
    }
  }

  return { values, setValue, errors, formError, isSubmitting, submit, resend, isResending, wasResent, secondsLeft, canResend: secondsLeft <= 0 }
}
