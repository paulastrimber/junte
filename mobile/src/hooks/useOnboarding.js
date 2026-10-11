import { useState } from 'react'

import * as usersApi from '../services/api/users.js'
import { fieldErrorsFrom, messageForError } from '../utils/errorMessages.js'
import { validateBirthDate } from '../utils/validation.js'
import { useAuth } from './useAuth.js'
import { useCatalogs } from './useCatalogs.js'
import { useProfileDraft } from './useProfileDraft.js'

/** Los 3 pasos y qué campos guarda cada uno. Todo es opcional: cada paso se puede saltar. */
export const ONBOARDING_STEPS = Object.freeze([
  { id: 'about', title: 'Contanos sobre vos', fields: ['birthDate'] },
  { id: 'study', title: 'Estudios y zona', fields: ['university', 'career', 'city', 'neighborhood'] },
  { id: 'interests', title: '¿Qué te gusta hacer?', fields: ['interests'] }
])

const LAST = ONBOARDING_STEPS.length - 1

/**
 * Onboarding de primer ingreso en 3 pasos. Cada "Siguiente" guarda lo de ese paso (si cambió algo), así que cerrar la app a
 * mitad no pierde lo cargado. Terminar —sea completando, saltando o con "Más tarde"— marca el onboarding como hecho
 * (`onboardingCompleted: true`) y la navegación pasa a la app; lo que falte se completa después desde el Perfil.
 */
export function useOnboarding () {
  const { user, setUser } = useAuth()
  const catalogs = useCatalogs()
  const draft = useProfileDraft(user, catalogs.catalog)
  const [stepIndex, setStepIndex] = useState(0)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const step = ONBOARDING_STEPS[stepIndex]
  const isLast = stepIndex === LAST

  function clear (field) {
    setErrors((current) => ({ ...current, [field]: undefined }))
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

  /** Manda los cambios al back. Si fue el último, `setUser` hace que la navegación salga del onboarding. */
  async function save (changes) {
    setIsSaving(true)
    setFormError(null)
    try {
      const updated = await usersApi.updateMe(changes)
      setErrors({})
      setUser(updated)
      return true
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else setFormError({ message: messageForError(error), requestId: error?.requestId ?? null })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  function advance () {
    setErrors({})
    setFormError(null)
    setStepIndex((current) => Math.min(current + 1, LAST))
  }

  async function next () {
    if (isSaving) return
    if (step.id === 'about') {
      const message = validateBirthDate(draft.values.birthDate)
      if (message) {
        setErrors({ birthDate: message })
        return
      }
    }
    const changes = draft.changesFor(step.fields)
    if (isLast) changes.onboardingCompleted = true
    if (Object.keys(changes).length === 0) {
      advance()
      return
    }
    if (await save(changes) && !isLast) advance()
  }

  /** Salta el paso sin guardar nada. En el último, termina el onboarding. */
  async function skip () {
    if (isSaving) return
    if (isLast) await save({ onboardingCompleted: true })
    else advance()
  }

  function back () {
    if (isSaving || stepIndex === 0) return
    setErrors({})
    setFormError(null)
    setStepIndex((current) => current - 1)
  }

  /** "Más tarde": sale del onboarding ahora (lo ya guardado queda) y no vuelve a aparecer. */
  async function later () {
    if (!isSaving) await save({ onboardingCompleted: true })
  }

  return {
    step,
    stepIndex,
    stepCount: ONBOARDING_STEPS.length,
    isLast,
    values: draft.values,
    options: draft.options,
    age: draft.age,
    catalogStatus: catalogs.status,
    retryCatalogs: catalogs.retry,
    setValue,
    toggleInterest,
    errors,
    formError,
    isSaving,
    next,
    skip,
    back,
    later
  }
}
