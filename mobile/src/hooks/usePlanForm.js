import { useMemo, useState } from 'react'

import * as plansApi from '../services/api/plans.js'
import { isApiError } from '../services/api/errors.js'
import { toggleInterest as toggleInterestIn, visibleInterestCategories } from '../utils/catalog.js'
import { fieldErrorsFrom, messageForError } from '../utils/errorMessages.js'
import { formValuesFrom, planChanges, toPlanPayload, validatePlanForm } from '../utils/plans.js'
import { useAuth } from './useAuth.js'
import { useCatalogs } from './useCatalogs.js'

// Los `details` del back nombran el campo del body; el formulario tiene los suyos.
function formFieldFor (path) {
  if (path === 'location.label') return 'locationLabel'
  if (path.startsWith('location')) return 'coordinates'
  return path
}

function serverFieldErrors (error) {
  if (isApiError(error) && error.code === 'CAPACITY_BELOW_PARTICIPANTS') return { capacity: error.message }
  return Object.fromEntries(Object.entries(fieldErrorsFrom(error)).map(([path, message]) => [formFieldFor(path), message]))
}

/**
 * Formulario de crear o editar un plan. Al editar solo se manda lo que cambió (PATCH parcial).
 * La UI no da el plan por guardado hasta que el servidor responde: `onSaved` recibe el plan que devolvió la API.
 * @param {object} [params]
 * @param {object | null} [params.plan]  Plan a editar; sin él se crea uno nuevo.
 * @param {(plan: object) => void} [params.onSaved]
 */
export function usePlanForm ({ plan = null, onSaved } = {}) {
  const { user } = useAuth()
  const catalogs = useCatalogs()
  const [values, setValues] = useState(() => formValuesFrom(plan))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  const isEditing = plan !== null
  // Las opciones con edad mínima solo se muestran a quien la tiene (el back lo vuelve a comprobar).
  const interestCategories = useMemo(() => visibleInterestCategories(catalogs.catalog, user?.age ?? null), [catalogs.catalog, user?.age])

  function setValue (field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function toggleInterest (key) {
    setValues((current) => ({ ...current, interests: toggleInterestIn(current.interests, key) }))
    setErrors((current) => ({ ...current, interests: undefined }))
  }

  async function submit () {
    if (isSaving) return
    const startChanged = !isEditing || (values.startsAt !== null && values.startsAt.getTime() !== new Date(plan.startsAt).getTime())
    const local = validatePlanForm(values, { startChanged })
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }

    const changes = isEditing ? planChanges(plan, values) : null
    if (isEditing && Object.keys(changes).length === 0) {
      onSaved?.(plan)
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      const saved = isEditing ? await plansApi.updatePlan(plan.id, changes) : await plansApi.createPlan(toPlanPayload(values))
      if (!isEditing) setValues(formValuesFrom(null))
      onSaved?.(saved)
    } catch (error) {
      const fields = serverFieldErrors(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else setFormError({ message: messageForError(error), requestId: error?.requestId ?? null, code: error?.code ?? null })
    } finally {
      setIsSaving(false)
    }
  }

  return {
    values,
    isEditing,
    interestCategories,
    catalogStatus: catalogs.status,
    retryCatalogs: catalogs.retry,
    canCreate: Boolean(user?.profileComplete),
    setValue,
    toggleInterest,
    errors,
    formError,
    isSaving,
    submit
  }
}
