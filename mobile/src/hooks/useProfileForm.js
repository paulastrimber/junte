import { useMemo, useState } from 'react'

import * as usersApi from '../services/api/users.js'
import { fieldErrorsFrom, messageForError } from '../utils/errorMessages.js'
import { toggleInterest } from '../utils/interests.js'
import { NAME_MAX, PLACE_MAX, UNIVERSITY_MAX, validateBirthDate, validateName, validateOptionalText } from '../utils/validation.js'
import { useAuth } from './useAuth.js'

const TEXT_FIELDS = ['name', 'university', 'neighborhood', 'city']

const fromUser = (user) => ({
  name: user?.name ?? '',
  birthDate: user?.birthDate ?? '',
  university: user?.university ?? '',
  neighborhood: user?.neighborhood ?? '',
  city: user?.city ?? '',
  interests: user?.interests ?? []
})

const sameItems = (a, b) => a.length === b.length && a.every((item) => b.includes(item))

/**
 * Edición del perfil propio. Solo se manda lo que cambió (PUT /users/me admite cambios parciales).
 * La edad no se edita: la calcula el servidor desde la fecha de nacimiento.
 */
export function useProfileForm () {
  const { user, setUser } = useAuth()
  const initial = useMemo(() => fromUser(user), [user])
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const changes = useMemo(() => {
    const changed = {}
    for (const field of TEXT_FIELDS) {
      if (values[field].trim() !== initial[field]) changed[field] = values[field].trim()
    }
    if (values.birthDate !== initial.birthDate) changed.birthDate = values.birthDate
    if (!sameItems(values.interests, initial.interests)) changed.interests = values.interests
    return changed
  }, [values, initial])

  const isDirty = Object.keys(changes).length > 0

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSavedAt(null)
  }

  function toggle (id) {
    setValue('interests', toggleInterest(values.interests, id))
  }

  function validate () {
    const found = {
      name: validateName(values.name),
      birthDate: validateBirthDate(values.birthDate),
      university: validateOptionalText(values.university, { max: UNIVERSITY_MAX, label: 'La universidad' }),
      neighborhood: validateOptionalText(values.neighborhood, { max: PLACE_MAX, label: 'El barrio' }),
      city: validateOptionalText(values.city, { max: PLACE_MAX, label: 'La localidad' })
    }
    // Todavía no hay forma de borrar un dato opcional ya guardado (ver docs/pendientes.md).
    for (const field of ['university', 'neighborhood', 'city']) {
      if (!found[field] && initial[field] !== '' && values[field].trim() === '') {
        found[field] = 'Por ahora no se puede borrar este dato. Podés cambiarlo por otro.'
      }
    }
    return Object.fromEntries(Object.entries(found).filter(([, message]) => message))
  }

  async function submit () {
    if (isSaving || !isDirty) return
    const found = validate()
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      const updated = await usersApi.updateMe(changes)
      setUser(updated)
      setSavedAt(Date.now())
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else setFormError({ message: messageForError(error), requestId: error?.requestId ?? null })
    } finally {
      setIsSaving(false)
    }
  }

  return {
    values,
    setValue,
    toggleInterest: toggle,
    errors,
    formError,
    isSaving,
    isDirty,
    justSaved: savedAt !== null && !isDirty,
    maxLengths: { name: NAME_MAX, university: UNIVERSITY_MAX, neighborhood: PLACE_MAX, city: PLACE_MAX },
    submit
  }
}
