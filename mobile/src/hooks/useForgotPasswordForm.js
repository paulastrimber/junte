import { useState } from 'react'

import { forgotPassword } from '../services/api/auth.js'
import { toViewError } from '../utils/errorMessages.js'
import { validateEmail } from '../utils/validation.js'

/**
 * Primer paso de "olvidé mi contraseña": pedir que llegue un código por email.
 * El servidor responde igual exista o no una cuenta con ese email, así que acá "enviado" solo significa que el pedido
 * llegó: la pantalla siguiente lo explica.
 * @param {object} options
 * @param {string} [options.initialEmail]  Lo que la persona ya había escrito en el login.
 * @param {(email: string) => void} options.onSent  El pedido llegó al servidor: se pasa a escribir el código.
 * @returns {{
 *   email: string, setEmail: (value: string) => void, error: string | null,
 *   formError: import('../utils/errorMessages.js').ViewError | null, isSubmitting: boolean, submit: () => Promise<void>
 * }}
 */
export function useForgotPasswordForm ({ initialEmail = '', onSent }) {
  const [email, setEmailValue] = useState(initialEmail)
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setEmail (value) {
    setEmailValue(value)
    setError(null)
  }

  async function submit () {
    if (isSubmitting) return
    const found = validateEmail(email)
    if (found) {
      setError(found)
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const address = email.trim()
      await forgotPassword({ email: address })
      onSent(address)
    } catch (failure) {
      setFormError(toViewError(failure))
    } finally {
      setIsSubmitting(false)
    }
  }

  return { email, setEmail, error, formError, isSubmitting, submit }
}
