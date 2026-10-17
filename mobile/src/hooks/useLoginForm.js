import { useMemo, useState } from 'react'

import { toViewError } from '../utils/errorMessages.js'
import { validateEmail, validatePassword } from '../utils/validation.js'
import { useAuth } from './useAuth.js'

/**
 * Estado y envío del formulario de login: validación local, errores por `code` y estado de carga.
 * @returns {{
 *   values: { email: string, password: string }, setValue: (field: string, value: string) => void,
 *   errors: Record<string, string>, formError: import('../utils/errorMessages.js').ViewError | null,
 *   notice: import('../utils/errorMessages.js').ViewError | null, isSubmitting: boolean, submit: () => Promise<void>
 * }}
 */
export function useLoginForm () {
  const { signIn, sessionEndedBy } = useAuth()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Si la sesión terminó sola (refresh rechazado, cuenta suspendida) se explica por qué se llegó acá.
  const notice = useMemo(() => (sessionEndedBy ? toViewError(sessionEndedBy) : null), [sessionEndedBy])

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit () {
    if (isSubmitting) return
    const found = {
      email: validateEmail(values.email),
      password: validatePassword(values.password, { checkLength: false })
    }
    if (found.email || found.password) {
      setErrors(found)
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await signIn({ email: values.email.trim(), password: values.password })
    } catch (error) {
      setFormError(toViewError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    values,
    setValue,
    errors,
    formError,
    notice,
    isSubmitting,
    submit
  }
}
