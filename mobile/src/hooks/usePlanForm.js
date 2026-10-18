import { useMemo, useRef, useState } from 'react'

import * as plansApi from '../services/api/plans.js'
import { isApiError } from '../services/api/errors.js'
import { toggleInterest as toggleInterestIn, visibleInterestCategories } from '../utils/catalog.js'
import { fieldErrorsFrom, toViewError } from '../utils/errorMessages.js'
import { PLAN_FORM_FIELDS, formValuesFrom, planChanges, planFormIssues, toPlanPayload, validatePlanForm } from '../utils/plans.js'
import { useAuth } from './useAuth.js'
import { useCatalogs } from './useCatalogs.js'

// Los `details` del back nombran el campo del body; el formulario tiene los suyos. Las rutas de array o anidadas
// (`interests.0`) se quedan con el primer tramo.
function formFieldFor (path) {
  if (path === 'location.label') return 'locationLabel'
  if (path.startsWith('location')) return 'coordinates'
  return path.split('.')[0]
}

/**
 * Errores del servidor repartidos entre los campos del formulario y un error general.
 * Lo que no corresponde a ningún campo visible (`creatorId`, la raíz del body) va al error general: nunca se pierde.
 * @returns {{ fields: Record<string, string>, formError: import('../utils/errorMessages.js').ViewError | null }}
 */
function serverErrors (error) {
  // El back explica el mínimo posible ("ya hay 5 inscriptos"): se muestra su texto en el campo del cupo.
  if (isApiError(error) && error.code === 'CAPACITY_BELOW_PARTICIPANTS') return { fields: { capacity: error.message }, formError: null }
  const fields = {}
  let hasUnknown = false
  for (const [path, message] of Object.entries(fieldErrorsFrom(error))) {
    const name = formFieldFor(path)
    if (PLAN_FORM_FIELDS.includes(name)) fields[name] ??= message
    else hasUnknown = true
  }
  const hasFields = Object.keys(fields).length > 0
  return { fields, formError: hasUnknown || !hasFields ? toViewError(error) : null }
}

/**
 * Formulario de crear o editar un plan. Al editar solo se manda lo que cambió (PATCH parcial).
 * La UI no da el plan por guardado hasta que el servidor responde: `onSaved` recibe el plan que devolvió la API.
 * @param {object} [params]
 * @param {object | null} [params.plan]  Plan a editar; sin él se crea uno nuevo.
 * @param {(plan: object) => void} [params.onSaved]
 * Errores: `errors` por campo (texto) y `formError` (`ViewError`) para el resto.
 * `submit()` resuelve con lo que pasó, para que la pantalla dé el feedback (scroll, aviso, anuncio):
 * `{ status: 'busy' }` | `{ status: 'invalid', fields }` | `{ status: 'unchanged' }` | `{ status: 'saved', plan }` |
 * `{ status: 'failed', fields, formError }` (`fields` en orden visual; `formError`: el error general, o null).
 */
export function usePlanForm ({ plan = null, onSaved } = {}) {
  const { user } = useAuth()
  const catalogs = useCatalogs()
  const [values, setValues] = useState(() => formValuesFrom(plan))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  // `isSaving` es del render anterior: dos toques en el mismo frame lo verían en false. El ref se marca en el acto.
  const savingRef = useRef(false)

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
    if (savingRef.current) return { status: 'busy' }
    const startChanged = !isEditing || (values.startsAt !== null && values.startsAt.getTime() !== new Date(plan.startsAt).getTime())
    const local = validatePlanForm(values, { startChanged })
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return { status: 'invalid', fields: planFormIssues(local) }
    }

    const changes = isEditing ? planChanges(plan, values) : null
    if (isEditing && Object.keys(changes).length === 0) {
      onSaved?.(plan)
      return { status: 'unchanged' }
    }

    savingRef.current = true
    setIsSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const saved = isEditing ? await plansApi.updatePlan(plan.id, changes) : await plansApi.createPlan(toPlanPayload(values))
      if (!isEditing) setValues(formValuesFrom(null))
      onSaved?.(saved)
      return { status: 'saved', plan: saved }
    } catch (error) {
      const { fields, formError: general } = serverErrors(error)
      setErrors(fields)
      setFormError(general)
      return { status: 'failed', fields: planFormIssues(fields), formError: general }
    } finally {
      savingRef.current = false
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
