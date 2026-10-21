import { useState } from 'react'

import { fieldErrorsFrom, messageForError, toViewError } from '../utils/errorMessages.js'
import { validateEmail, validateName, validatePassword } from '../utils/validation.js'
import { useAuth } from './useAuth.js'

/**
 * Estado y envío del formulario de registro. Los errores de validación del servidor (`details`) se
 * muestran junto a cada campo; el resto (red, rate limit) como error del formulario (`formError`, un `ViewError`).
 */
export function useRegisterForm () {
  const { signUp } = useAuth()
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit () {
    if (isSubmitting) return
    const found = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      password: validatePassword(values.password)
    }
    if (found.name || found.email || found.password) {
      setErrors(found)
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await signUp({ name: values.name.trim(), email: values.email.trim(), password: values.password })
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
      } else if (error?.code === 'EMAIL_TAKEN') {
        // El email duplicado se marca en su campo: es lo que la persona tiene que cambiar.
        setErrors({ email: messageForError(error) })
      } else {
        setFormError(toViewError(error))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return { values, setValue, errors, formError, isSubmitting, submit }
}
