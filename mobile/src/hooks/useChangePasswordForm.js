import { useState } from 'react'

import { changePassword } from '../services/api/auth.js'
import { fieldErrorsFrom, toViewError } from '../utils/errorMessages.js'
import { validatePassword } from '../utils/validation.js'

const SAME_PASSWORD = 'La contraseña nueva tiene que ser distinta de la actual.'

/**
 * Cambiar la contraseña con la sesión iniciada (desde el Perfil): la actual y la nueva.
 * Solo se da por cambiada cuando el servidor lo confirma. Si la actual no es correcta, el servidor lo dice en el
 * detalle de ese campo. Las demás sesiones de la cuenta se cierran; esta sigue abierta.
 * @returns {{
 *   values: { currentPassword: string, newPassword: string }, setValue: (field: string, value: string) => void,
 *   errors: Record<string, string>, formError: import('../utils/errorMessages.js').ViewError | null,
 *   isSubmitting: boolean, isDone: boolean, submit: () => Promise<void>
 * }}
 */
export function useChangePasswordForm () {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit () {
    if (isSubmitting) return
    const found = {
      // La actual no se valida por largo: es la que la persona ya tiene.
      currentPassword: validatePassword(values.currentPassword, { checkLength: false }),
      newPassword: validatePassword(values.newPassword)
    }
    if (!found.currentPassword && !found.newPassword && values.newPassword === values.currentPassword) found.newPassword = SAME_PASSWORD
    if (found.currentPassword || found.newPassword) {
      setErrors(found)
      return
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      // No quedan contraseñas en memoria más de lo necesario.
      setValues({ currentPassword: '', newPassword: '' })
      setIsDone(true)
    } catch (failure) {
      const fields = fieldErrorsFrom(failure)
      if (fields.currentPassword || fields.newPassword) setErrors(fields)
      else setFormError(toViewError(failure))
    } finally {
      setIsSubmitting(false)
    }
  }

  return { values, setValue, errors, formError, isSubmitting, isDone, submit }
}
