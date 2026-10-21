import { useCallback, useRef, useState } from 'react'

import { toApiError } from '../services/api/client.js'
import { REPORT_DESCRIPTION_MAX_LENGTH, createReport } from '../services/api/reports.js'
import { OUTBOX_TYPE, connectivity, isTransportFailure, outbox } from '../services/offline/index.js'
import { fieldErrorsFrom, messageForError } from '../utils/errorMessages.js'

export const REPORT_STATUS = Object.freeze({ IDLE: 'idle', SENDING: 'sending', SENT: 'sent', QUEUED: 'queued' })

const REPORT_MESSAGES = Object.freeze({
  NOT_FOUND: 'Lo que querés reportar ya no está disponible.',
  VALIDATION_ERROR: 'Revisá el motivo y la descripción.'
})

/**
 * Las mismas reglas que el back, para avisar antes de mandar.
 * @returns {Record<string, string>} errores por campo (vacío si está bien).
 */
export function validateReport ({ reason, description }) {
  const fieldErrors = {}
  const text = description.trim()
  if (!reason) fieldErrors.reason = 'Elegí un motivo.'
  if (reason === 'other' && text === '') fieldErrors.description = 'Contanos qué pasó.'
  if (text.length > REPORT_DESCRIPTION_MAX_LENGTH) fieldErrors.description = `Hasta ${REPORT_DESCRIPTION_MAX_LENGTH} caracteres.`
  return fieldErrors
}

/**
 * Formulario de un reporte (S6-MOB-03). Validación local (motivo elegido; descripción obligatoria con "otro", hasta 500)
 * y envío. El reporte solo se da por enviado cuando el servidor lo acepta; sin conexión queda en la cola de pendientes.
 * @param {{ targetType: 'user' | 'plan' | 'message', targetId: string, label?: string }} target  `label` describe lo reportado en la cola.
 */
export function useReport ({ targetType, targetId, label = null }) {
  const [reason, setReason] = useState(null)
  const [description, setDescription] = useState('')
  const [state, setState] = useState({ status: REPORT_STATUS.IDLE, isDuplicate: false, formError: null, fieldErrors: {} })
  const busyRef = useRef(false)

  const submit = useCallback(async () => {
    if (busyRef.current) return
    const fieldErrors = validateReport({ reason, description })
    if (Object.keys(fieldErrors).length > 0) {
      setState((current) => ({ ...current, fieldErrors, formError: null }))
      return
    }
    busyRef.current = true
    const body = { targetType, targetId, reason, ...(description.trim() ? { description: description.trim() } : {}) }
    const enqueue = async () => {
      await outbox.enqueue(OUTBOX_TYPE.REPORT, { ...body, label })
      setState({ status: REPORT_STATUS.QUEUED, isDuplicate: false, formError: null, fieldErrors: {} })
    }
    setState((current) => ({ ...current, status: REPORT_STATUS.SENDING, formError: null, fieldErrors: {} }))
    try {
      if (!connectivity.isOnline()) return await enqueue()
      const { isDuplicate } = await createReport(body)
      setState({ status: REPORT_STATUS.SENT, isDuplicate, formError: null, fieldErrors: {} })
    } catch (failure) {
      const error = toApiError(failure)
      if (isTransportFailure(error)) return await enqueue()
      setState({
        status: REPORT_STATUS.IDLE,
        isDuplicate: false,
        formError: { message: messageForError(error, REPORT_MESSAGES), requestId: error.requestId },
        fieldErrors: fieldErrorsFrom(error)
      })
    } finally {
      busyRef.current = false
    }
  }, [targetType, targetId, reason, description, label])

  return {
    reason,
    description,
    setReason: (value) => { setReason(value); setState((current) => ({ ...current, fieldErrors: { ...current.fieldErrors, reason: undefined } })) },
    setDescription: (value) => { setDescription(value); setState((current) => ({ ...current, fieldErrors: { ...current.fieldErrors, description: undefined } })) },
    ...state,
    isSending: state.status === REPORT_STATUS.SENDING,
    submit
  }
}
