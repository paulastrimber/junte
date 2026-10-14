import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { useCatalogs } from '../hooks/useCatalogs.js'
import { LIST_STATUS } from '../hooks/usePagedList.js'
import { useParticipants } from '../hooks/useParticipants.js'
import { PLAN_STATUS, usePlan } from '../hooks/usePlan.js'
import { PLAN_ACTION, usePlanActions } from '../hooks/usePlanActions.js'
import { usePlanAutoRefresh } from '../hooks/usePlanAutoRefresh.js'
import { ROUTES } from '../navigation/routes.js'
import { formatReputation, planActions } from '../utils/attendance.js'
import { messageForError } from '../utils/errorMessages.js'
import { formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Plan',
  loading: 'Cargando el plan…',
  notFoundTitle: 'Este plan no está disponible',
  notFoundMessage: 'Puede que se haya cancelado, que ya haya terminado o que el enlace no sea correcto.',
  errorTitle: 'No pudimos cargar el plan.',
  retry: 'Reintentar',
  back: 'Volver',
  when: 'Cuándo',
  where: 'Dónde',
  price: 'Costo',
  spots: 'Cupo',
  joined: 'Inscriptos',
  activities: 'Tipo de actividad',
  about: 'Descripción',
  creator: 'Organiza',
  you: 'Vos',
  edit: 'Editar plan',
  full: 'Este plan está lleno: no admite más inscripciones.',
  join: 'Inscribirme',
  leave: 'Darme de baja',
  joinedNotice: 'Estás inscripto en este plan.',
  checkIn: 'Registrar mi asistencia',
  checkedIn: 'Ya registraste tu asistencia.',
  noShow: 'No registraste tu asistencia a este plan.',
  chat: 'Chat del plan',
  showQr: 'Mostrar QR de asistencia',
  closeSignUps: 'Cerrar inscripciones',
  reopenSignUps: 'Reabrir inscripciones',
  cancelPlan: 'Cancelar plan',
  confirmCancel: 'Sí, cancelar el plan',
  confirmCancelHint: 'Cancelar un plan no se puede deshacer.',
  keepPlan: 'No cancelar',
  participants: 'Quiénes van',
  participantsLoading: 'Cargando la lista…',
  participantsEmpty: 'Todavía no hay nadie anotado.',
  participantsError: 'No pudimos cargar la lista.',
  participantsMore: 'Ver más',
  statusLabels: { closed: 'Inscripciones cerradas', cancelled: 'Plan cancelado', completed: 'Plan finalizado' }
})

// Nombre de cada interés según el catálogo; si todavía no cargó (o ya no existe), la key.
function interestNames (keys, catalog) {
  const names = new Map((catalog?.interestCategories ?? []).flatMap((category) => category.interests).map(({ key, name }) => [key, name]))
  return keys.map((key) => names.get(key) ?? key)
}

function Row ({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

/** Lista de anotados: la ven quienes participan y quien organiza. Presentacional (los datos llegan por props). */
function Participants ({ list, creatorId }) {
  const { loadMore, retry } = list
  return (
    <View style={styles.block}>
      <Text style={styles.rowLabel}>{TEXTS.participants}</Text>
      {list.status === LIST_STATUS.LOADING ? <Text style={styles.muted}>{TEXTS.participantsLoading}</Text> : null}
      {list.status === LIST_STATUS.ERROR
        ? (
          <>
            <ErrorBanner message={`${TEXTS.participantsError} ${messageForError(list.error)}`} requestId={list.error?.requestId} />
            <Button title={TEXTS.retry} variant='secondary' onPress={retry} />
          </>
          )
        : null}
      {list.status === LIST_STATUS.READY && list.items.length === 0 ? <Text style={styles.muted}>{TEXTS.participantsEmpty}</Text> : null}
      {list.items.map((person) => (
        <View key={person.id} style={styles.participant}>
          <Text style={styles.rowValue}>{person.id === creatorId ? `${person.name ?? ''} (${TEXTS.creator.toLowerCase()})` : person.name}</Text>
          <Text style={styles.muted}>{formatReputation(person.reputation)}</Text>
        </View>
      ))}
      {list.loadMoreError ? <ErrorBanner message={messageForError(list.loadMoreError)} requestId={list.loadMoreError.requestId} /> : null}
      {list.hasMore ? <Button title={TEXTS.participantsMore} variant='secondary' loading={list.isLoadingMore} onPress={loadMore} /> : null}
    </View>
  )
}

export default function PlanScreen ({ navigation, route }) {
  // `version` cambia cuando se vuelve de editar: fuerza a pedir el plan otra vez.
  const { planId, version = 0 } = route.params
  const { status, plan, error, reload, refresh } = usePlan(planId, version)
  const { catalog } = useCatalogs()
  // Cada cambio confirmado por el servidor vuelve a pedir el plan y la lista de anotados.
  const [changes, setChanges] = useState(0)
  const onChanged = useCallback(() => {
    setChanges((value) => value + 1)
    refresh()
  }, [refresh])
  const actions = usePlanActions(planId, { onChanged })
  const { join, leave, closeSignUps, reopenSignUps, cancel } = actions
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)
  const can = plan ? planActions(plan) : null
  const participants = useParticipants(planId, { enabled: Boolean(can?.canSeeParticipants), version: changes })

  // Al volver del QR o del check-in el plan pudo cambiar (asistencia registrada).
  useEffect(() => navigation.addListener('focus', onChanged), [navigation, onChanged])
  // Y sin salir de la pantalla: cuando abre el horario de asistencia (aparece el botón) o la app vuelve a primer plano.
  usePlanAutoRefresh(plan, refresh)

  if (status === PLAN_STATUS.LOADING) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={TEXTS.loading} />
        <Text>{TEXTS.loading}</Text>
      </View>
    )
  }

  if (status === PLAN_STATUS.NOT_FOUND) {
    return <EmptyState title={TEXTS.notFoundTitle} message={TEXTS.notFoundMessage} actionTitle={TEXTS.back} onAction={() => navigation.goBack()} />
  }

  if (status === PLAN_STATUS.ERROR) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{TEXTS.errorTitle}</Text>
        <ErrorBanner message={messageForError(error)} requestId={error?.requestId} />
        <Button title={TEXTS.retry} onPress={reload} />
      </View>
    )
  }

  const statusLabel = TEXTS.statusLabels[plan.status]

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole='header'>{plan.title}</Text>
      {statusLabel ? <Text style={styles.notice}>{statusLabel}</Text> : null}
      {plan.isFull ? <Text style={styles.notice}>{TEXTS.full}</Text> : null}

      <Row label={TEXTS.when} value={formatSchedule(plan.startsAt, plan.endsAt)} />
      <Row label={TEXTS.where} value={plan.location.label} />
      <Row label={TEXTS.price} value={formatPrice(plan.price)} />
      <Row label={TEXTS.spots} value={formatSpots(plan)} />
      <Row label={TEXTS.joined} value={plan.capacity === null ? String(plan.participantCount) : `${plan.participantCount} de ${plan.capacity}`} />
      <Row label={TEXTS.activities} value={interestNames(plan.interests, catalog).join(', ')} />

      {plan.description
        ? (
          <View style={styles.block}>
            <Text style={styles.rowLabel}>{TEXTS.about}</Text>
            <Text style={styles.description}>{plan.description}</Text>
          </View>
          )
        : null}

      {plan.creator
        ? (
          <View style={styles.creator}>
            <Avatar photoUrl={plan.creator.photoUrl} name={plan.creator.name} />
            <View>
              <Text style={styles.rowLabel}>{TEXTS.creator}</Text>
              <Text style={styles.rowValue}>{plan.isCreator ? `${plan.creator.name ?? ''} (${TEXTS.you})` : plan.creator.name}</Text>
              <Text style={styles.muted}>{formatReputation(plan.creator.reputation ?? 0)}</Text>
            </View>
          </View>
          )
        : null}

      {can.isJoined && !can.hasCheckedIn && !can.wasNoShow ? <Text style={styles.success}>{TEXTS.joinedNotice}</Text> : null}
      {can.hasCheckedIn ? <Text style={styles.success}>{TEXTS.checkedIn}</Text> : null}
      {can.wasNoShow ? <Text style={styles.notice}>{TEXTS.noShow}</Text> : null}

      <ErrorBanner message={actions.error?.message} requestId={actions.error?.requestId} />

      {can.canJoin ? <Button title={TEXTS.join} loading={actions.pending === PLAN_ACTION.JOIN} disabled={actions.isBusy} onPress={join} /> : null}
      {can.canCheckIn
        ? <Button title={TEXTS.checkIn} onPress={() => navigation.navigate(ROUTES.CHECK_IN, { planId: plan.id })} />
        : null}
      {can.canShowQr
        ? <Button title={TEXTS.showQr} onPress={() => navigation.navigate(ROUTES.PLAN_QR, { planId: plan.id, canCheckIn: can.canCreatorCheckIn })} />
        : null}
      {can.canLeave
        ? <Button title={TEXTS.leave} variant='secondary' loading={actions.pending === PLAN_ACTION.LEAVE} disabled={actions.isBusy} onPress={leave} />
        : null}

      {can.canChat
        ? <Button title={TEXTS.chat} variant='secondary' onPress={() => navigation.navigate(ROUTES.CHAT, { planId: plan.id, title: plan.title })} />
        : null}

      {can.canSeeParticipants ? <Participants list={participants} creatorId={plan.creator?.id} /> : null}

      {plan.isCreator
        ? <Button title={TEXTS.edit} variant='secondary' onPress={() => navigation.navigate(ROUTES.EDIT_PLAN, { plan })} />
        : null}
      {can.canCloseSignUps
        ? <Button title={TEXTS.closeSignUps} variant='secondary' loading={actions.pending === PLAN_ACTION.CLOSE} disabled={actions.isBusy} onPress={closeSignUps} />
        : null}
      {can.canReopenSignUps
        ? <Button title={TEXTS.reopenSignUps} variant='secondary' loading={actions.pending === PLAN_ACTION.REOPEN} disabled={actions.isBusy} onPress={reopenSignUps} />
        : null}
      {can.canCancel && !isConfirmingCancel
        ? <Button title={TEXTS.cancelPlan} variant='danger' disabled={actions.isBusy} onPress={() => setIsConfirmingCancel(true)} />
        : null}
      {can.canCancel && isConfirmingCancel
        ? (
          <View style={styles.block}>
            <Text style={styles.notice}>{TEXTS.confirmCancelHint}</Text>
            <Button
              title={TEXTS.confirmCancel}
              variant='danger'
              loading={actions.pending === PLAN_ACTION.CANCEL}
              disabled={actions.isBusy}
              onPress={async () => {
                await cancel()
                setIsConfirmingCancel(false)
              }}
            />
            <Button title={TEXTS.keepPlan} variant='secondary' disabled={actions.isBusy} onPress={() => setIsConfirmingCancel(false)} />
          </View>
          )
        : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24, gap: 12, alignItems: 'stretch', justifyContent: 'center', backgroundColor: '#fff' },
  content: { padding: 24, gap: 14, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', color: '#222' },
  notice: { fontSize: 14, color: '#8a5a00', backgroundColor: '#fff6e0', padding: 10, borderRadius: 8 },
  row: { gap: 2 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  rowValue: { fontSize: 16, color: '#222' },
  block: { gap: 4 },
  description: { fontSize: 15, color: '#333', lineHeight: 21 },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  success: { fontSize: 14, color: '#1b7f3b', backgroundColor: '#e8f6ec', padding: 10, borderRadius: 8 },
  muted: { fontSize: 13, color: '#666' },
  participant: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#b42318' }
})
