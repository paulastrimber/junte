import { useState } from 'react'

import * as usersApi from '../services/api/users.js'
import { fieldErrorsFrom, messageForError } from '../utils/errorMessages.js'
import { NAME_MAX, validateBirthDate, validateName } from '../utils/validation.js'
import { useAuth } from './useAuth.js'
import { useCatalogs } from './useCatalogs.js'
import { useProfileDraft } from './useProfileDraft.js'

const FIELDS = ['name', 'birthDate', 'university', 'career', 'city', 'neighborhood', 'interests']

/**
 * Edición del perfil propio. Solo se manda lo que cambió (PUT /users/me admite cambios parciales).
 * La edad no se edita: la calcula el servidor desde la fecha de nacimiento.
 */
export function useProfileForm () {
  const { user, setUser } = useAuth()
  const catalogs = useCatalogs()
  const draft = useProfileDraft(user, catalogs.catalog)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const changes = draft.changesFor(FIELDS)
  const isDirty = Object.keys(changes).length > 0

  function clear (field) {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSavedAt(null)
  }

  function setValue (field, value) {
    draft.setField(field, value)
    clear(field)
    if (field === 'university') clear('career')
    if (field === 'city') clear('neighborhood')
  }

  function toggleInterest (key) {
    draft.toggleInterest(key)
    clear('interests')
  }

  async function submit () {
    if (isSaving || !isDirty) return
    const found = {
      name: validateName(draft.values.name),
      birthDate: validateBirthDate(draft.values.birthDate)
    }
    const local = Object.fromEntries(Object.entries(found).filter(([, message]) => message))
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      setUser(await usersApi.updateMe(changes))
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
    values: draft.values,
    options: draft.options,
    catalogStatus: catalogs.status,
    retryCatalogs: catalogs.retry,
    setValue,
    toggleInterest,
    errors,
    formError,
    isSaving,
    isDirty,
    justSaved: savedAt !== null && !isDirty,
    maxNameLength: NAME_MAX,
    submit
  }
}
