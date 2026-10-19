import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { Notice } from '../components/Notice.jsx'
import { OfflineNotice } from '../components/OfflineNotice.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useCatalogs } from '../hooks/useCatalogs.js'
import { useOfflineStatus } from '../hooks/useOffline.js'
import { LIST_STATUS } from '../hooks/usePagedList.js'
import { useParticipants } from '../hooks/useParticipants.js'
import { PLAN_STATUS, usePlan } from '../hooks/usePlan.js'
import { PLAN_ACTION, PLAN_ACTION_MESSAGES, usePlanActions } from '../hooks/usePlanActions.js'
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
  statusLabels: { closed: 'Inscripciones cerradas', cancelled: 'Plan cancelado', completed: 'Plan finalizado' },
  // Sin conexión (S6-MOB-02): la inscripción y la baja esperan en la cola; nunca se dan por hechas antes del servidor.
  joinQueued: 'Inscripción pendiente: la enviamos cuando vuelva la conexión. Todavía no estás inscripto.',
  leaveQueued: 'Baja pendiente: la enviamos cuando vuelva la conexión. Por ahora seguís inscripto.',
  cancelQueued: 'Cancelar',
  joinFailed: 'No pudimos inscribirte.',
  leaveFailed: 'No pudimos darte de baja.',
  dismiss: 'Entendido',
  needsConnection: 'Para registrar la asistencia necesitás conexión.',
  // Reportes (S6-MOB-03)
  reportPlan: 'Reportar este plan',
  reportCreator: (name) => `Reportar a ${name ?? 'quien organiza'}`,
  reportPerson: 'Reportar',
  reportPlanLabel: 'este plan',
  reportUserLabel: (name) => `a ${name ?? 'esta persona'}`
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
function Participants ({ list, creatorId, userId, onReport }) {
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
          <View style={styles.participantInfo}>
            <Text style={styles.rowValue}>{person.id === creatorId ? `${person.name ?? ''} (${TEXTS.creator.toLowerCase()})` : person.name}</Text>
            <Text style={styles.muted}>{formatReputation(person.reputation)}</Text>
          </View>
          {person.id !== userId
            ? <Button title={TEXTS.reportPerson} variant='ghost' size='sm' onPress={() => onReport(person)} />
            : null}
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
  const { status, plan, error, savedAt, reload, refresh } = usePlan(planId, version)
  const { catalog } = useCatalogs()
  const { user } = useAuth()
  const offline = useOfflineStatus()
  // Cada cambio confirmado por el servidor vuelve a pedir el plan y la lista de anotados.
  const [changes, setChanges] = useState(0)
  const onChanged = useCallback(() => {
    setChanges((value) => value + 1)
    refresh()
  }, [refresh])
  const actions = usePlanActions(planId, { onChanged, planTitle: plan?.title ?? null })
  const { join, leave, closeSignUps, reopenSignUps, cancel, discardQueued } = actions
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)
  const can = plan ? planActions(plan) : null
  const participants = useParticipants(planId, { enabled: Boolean(can?.canSeeParticipants), version: changes })

  // Al volver del QR o del check-in el plan pudo cambiar (asistencia registrada).
  useEffect(() => navigation.addListener('focus', onChanged), [navigation, onChanged])
  // Y sin salir de la pantalla: cuando abre el horario de asistencia (aparece el botón) o la app vuelve a primer plano.
  usePlanAutoRefresh(plan, refresh)

  const report = (params) => navigation.navigate(ROUTES.REPORT, params)
  const openPending = () => navigation.navigate(ROUTES.PENDING_ACTIONS)

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
    return <ErrorState title={TEXTS.errorTitle} error={error} onRetry={reload} retryTitle={TEXTS.retry} fill />
  }

  const statusLabel = TEXTS.statusLabels[plan.status]
  const { queued } = actions
  const isOnline = offline.isOnline && !savedAt
  // Lo que depende del momento y del lugar exactos (asistencia, QR) no se puede dejar pendiente.
  const needsConnection = !isOnline && (can.canCheckIn || can.canShowQr)

  function queuedNotice (item, { pendingText, failedText, action }) {
    if (!item) return null
    if (item.status === 'failed') {
      return (
        <Notice tone='danger' message={`${failedText} ${messageForError(item.error, PLAN_ACTION_MESSAGES[action])}`}>
          <Button title={TEXTS.dismiss} variant='ghost' size='sm' onPress={() => discardQueued(item.id)} style={styles.inlineButton} />
        </Notice>
      )
    }
    return (
      <Notice tone='warning' icon='cloud-upload-outline' message={pendingText}>
        {item.status === 'pending'
          ? <Button title={TEXTS.cancelQueued} variant='ghost' size='sm' onPress={() => discardQueued(item.id)} style={styles.inlineButton} />
          : null}
      </Notice>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <OfflineNotice savedAt={savedAt} isOnline={offline.isOnline} pendingCount={0} failedCount={offline.failedCount} onOpenPending={openPending} />
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
            <View style={styles.participantInfo}>
              <Text style={styles.rowLabel}>{TEXTS.creator}</Text>
              <Text style={styles.rowValue}>{plan.isCreator ? `${plan.creator.name ?? ''} (${TEXTS.you})` : plan.creator.name}</Text>
              <Text style={styles.muted}>{formatReputation(plan.creator.reputation ?? 0)}</Text>
            </View>
            {!plan.isCreator && plan.creator.id !== user?.id
              ? (
                <Button
                  title={TEXTS.reportPerson}
                  variant='ghost'
                  size='sm'
                  onPress={() => report({ targetType: 'user', targetId: plan.creator.id, label: TEXTS.reportUserLabel(plan.creator.name) })}
                />
                )
              : null}
          </View>
          )
        : null}

      {can.isJoined && !can.hasCheckedIn && !can.wasNoShow ? <Text style={styles.success}>{TEXTS.joinedNotice}</Text> : null}
      {can.hasCheckedIn ? <Text style={styles.success}>{TEXTS.checkedIn}</Text> : null}
      {can.wasNoShow ? <Text style={styles.notice}>{TEXTS.noShow}</Text> : null}

      {queuedNotice(queued.join, { pendingText: TEXTS.joinQueued, failedText: TEXTS.joinFailed, action: PLAN_ACTION.JOIN })}
      {queuedNotice(queued.leave, { pendingText: TEXTS.leaveQueued, failedText: TEXTS.leaveFailed, action: PLAN_ACTION.LEAVE })}
      <ErrorBanner message={actions.error?.message} requestId={actions.error?.requestId} />
      {needsConnection ? <Notice tone='warning' icon='cloud-offline-outline' message={TEXTS.needsConnection} /> : null}

      {can.canJoin && !queued.isWaiting
        ? <Button title={TEXTS.join} loading={actions.pending === PLAN_ACTION.JOIN} disabled={actions.isBusy} onPress={join} />
        : null}
      {can.canCheckIn
        ? <Button title={TEXTS.checkIn} disabled={!isOnline} onPress={() => navigation.navigate(ROUTES.CHECK_IN, { planId: plan.id })} />
        : null}
      {can.canShowQr
        ? <Button title={TEXTS.showQr} disabled={!isOnline} onPress={() => navigation.navigate(ROUTES.PLAN_QR, { planId: plan.id, canCheckIn: can.canCreatorCheckIn })} />
        : null}
      {can.canLeave && !queued.isWaiting
        ? <Button title={TEXTS.leave} variant='secondary' loading={actions.pending === PLAN_ACTION.LEAVE} disabled={actions.isBusy} onPress={leave} />
        : null}

      {can.canChat
        ? <Button title={TEXTS.chat} variant='secondary' onPress={() => navigation.navigate(ROUTES.CHAT, { planId: plan.id, title: plan.title })} />
        : null}

      {can.canSeeParticipants
        ? (
          <Participants
            list={participants}
            creatorId={plan.creator?.id}
            userId={user?.id}
            onReport={(person) => report({ targetType: 'user', targetId: person.id, label: TEXTS.reportUserLabel(person.name) })}
          />
          )
        : null}

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

      {!plan.isCreator
        ? <Button title={TEXTS.reportPlan} variant='ghost' icon='flag-outline' onPress={() => report({ targetType: 'plan', targetId: plan.id, label: TEXTS.reportPlanLabel })} />
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
  participantInfo: { flex: 1, gap: 2 },
  inlineButton: { alignSelf: 'flex-start' }
})
