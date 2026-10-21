import { ScrollView, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { DetailRow } from '../components/DetailRow.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { LoadingState } from '../components/LoadingState.jsx'
import { Notice } from '../components/Notice.jsx'
import { OfflineNotice } from '../components/OfflineNotice.jsx'
import { SectionHeader } from '../components/SectionHeader.jsx'
import { Text } from '../components/Text.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useOfflineStatus } from '../hooks/useOffline.js'
import { LIST_STATUS } from '../hooks/usePagedList.js'
import { PLAN_STATUS } from '../hooks/usePlan.js'
import { PLAN_ACTION, PLAN_ACTION_MESSAGES } from '../hooks/usePlanActions.js'
import { usePlanDetail } from '../hooks/usePlanDetail.js'
import { ROUTES } from '../navigation/routes.js'
import { borders, createThemedStyles, sizes, spacing } from '../theme/index.js'
import { formatReputation } from '../utils/attendance.js'
import { messageForError } from '../utils/errorMessages.js'
import { formatJoined, formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Plan',
  loading: 'Cargando el plan…',
  notFoundTitle: 'Este plan no está disponible',
  notFoundMessage: 'Puede que se haya cancelado, que ya haya terminado o que el enlace no sea correcto.',
  errorTitle: 'No pudimos cargar el plan.',
  refreshError: 'No pudimos actualizar el plan.',
  retry: 'Reintentar',
  back: 'Volver',
  when: 'Cuándo',
  where: 'Dónde',
  price: 'Costo',
  spots: 'Cupo',
  joined: 'Inscripciones',
  activities: 'Tipo de actividad',
  about: 'Descripción',
  creator: 'Organiza',
  you: 'Vos',
  edit: 'Editar plan',
  full: 'Este plan está lleno: no admite más inscripciones.',
  join: 'Inscribirme',
  leave: 'Darme de baja',
  confirmLeave: 'Sí, darme de baja',
  confirmLeaveHint: 'Si te das de baja, tu lugar lo puede ocupar otra persona.',
  keepJoined: 'Seguir en el plan',
  joinedNotice: 'Ya tenés tu lugar en este plan.',
  checkIn: 'Registrar mi asistencia',
  checkedIn: 'Ya registraste tu asistencia.',
  noShow: 'No registraste tu asistencia a este plan.',
  chat: 'Chat del plan',
  showQr: 'Mostrar QR de asistencia',
  organizer: 'Organizás vos',
  closeSignUps: 'Cerrar inscripciones',
  reopenSignUps: 'Reabrir inscripciones',
  cancelPlan: 'Cancelar plan',
  confirmCancel: 'Sí, cancelar el plan',
  confirmCancelHint: 'Cancelar un plan no se puede deshacer.',
  keepPlan: 'No cancelar',
  participants: 'Quiénes van',
  participantsLoading: 'Cargando la lista…',
  participantsEmpty: 'Todavía no se inscribió nadie.',
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

// Textos de cada confirmación (las acciones que no tienen vuelta atrás).
const CONFIRM_TEXTS = Object.freeze({
  [PLAN_ACTION.CANCEL]: { hint: TEXTS.confirmCancelHint, confirm: TEXTS.confirmCancel, dismiss: TEXTS.keepPlan },
  [PLAN_ACTION.LEAVE]: { hint: TEXTS.confirmLeaveHint, confirm: TEXTS.confirmLeave, dismiss: TEXTS.keepJoined }
})

/** Lista de anotados: la ven quienes participan y quien organiza. Presentacional (los datos llegan por props). */
function Participants ({ list, creatorId, userId, onReport }) {
  const styles = useStyles()
  const { loadMore, retry } = list
  return (
    <View style={styles.section}>
      <SectionHeader title={TEXTS.participants} />
      {list.status === LIST_STATUS.LOADING ? <LoadingState label={TEXTS.participantsLoading} /> : null}
      {list.status === LIST_STATUS.ERROR
        ? (
          <>
            <ErrorBanner title={TEXTS.participantsError} error={list.error} />
            <Button title={TEXTS.retry} variant='secondary' size='sm' icon='refresh-outline' onPress={retry} style={styles.start} />
          </>
          )
        : null}
      {list.status === LIST_STATUS.READY && list.items.length === 0 ? <Text color='textMuted'>{TEXTS.participantsEmpty}</Text> : null}
      {list.items.length > 0
        ? (
          <View>
            {list.items.map((person, index) => (
              <View key={person.id} style={[styles.person, index > 0 && styles.separated]}>
                {/* El nombre ya está escrito al lado: la foto es decorativa para el lector de pantalla. */}
                <Avatar photoUrl={person.photoUrl} name={person.name} size={sizes.avatarSm} decorative />
                <Text variant='bodyStrong' style={styles.personName}>
                  {person.id === creatorId ? `${person.name ?? ''} (${TEXTS.creator.toLowerCase()})` : person.name}
                </Text>
                <Text variant='caption' color='textMuted'>{formatReputation(person.reputation)}</Text>
                {person.id !== userId
                  ? <Button title={TEXTS.reportPerson} variant='ghost' size='sm' onPress={() => onReport(person)} />
                  : null}
              </View>
            ))}
          </View>
          )
        : null}
      <ErrorBanner error={list.loadMoreError} />
      {list.hasMore ? <Button title={TEXTS.participantsMore} variant='secondary' size='sm' loading={list.isLoadingMore} onPress={loadMore} style={styles.start} /> : null}
    </View>
  )
}

/** Confirmación en línea de una acción que no tiene vuelta atrás. */
function Confirmation ({ action, isBusy, isPending, onConfirm, onDismiss }) {
  const styles = useStyles()
  const texts = CONFIRM_TEXTS[action]
  return (
    <View style={styles.group}>
      <Notice tone='warning' message={texts.hint} accessibilityLiveRegion='polite' />
      <Button title={texts.confirm} variant='danger' loading={isPending} disabled={isBusy} onPress={onConfirm} />
      <Button title={texts.dismiss} variant='secondary' disabled={isBusy} onPress={onDismiss} />
    </View>
  )
}

export default function PlanScreen ({ navigation, route }) {
  const styles = useStyles()
  // `version` cambia cuando se vuelve de editar: fuerza a pedir el plan otra vez.
  const { planId, version = 0 } = route.params
  const detail = usePlanDetail(planId, { version, navigation })
  const { status, plan, error, refreshError, savedAt, reload, can, activities, actions, participants, confirmation } = detail
  const { join, closeSignUps, reopenSignUps, discardQueued } = actions
  const { askCancel, askLeave, confirm, dismiss } = confirmation
  const { user } = useAuth()
  const offline = useOfflineStatus()

  const report = (params) => navigation.navigate(ROUTES.REPORT, params)
  const openPending = () => navigation.navigate(ROUTES.PENDING_ACTIONS)

  if (status === PLAN_STATUS.LOADING) return <LoadingState label={TEXTS.loading} fill />

  if (status === PLAN_STATUS.NOT_FOUND) {
    return (
      <EmptyState
        tone='danger'
        icon='calendar-clear-outline'
        title={TEXTS.notFoundTitle}
        message={TEXTS.notFoundMessage}
        actionTitle={TEXTS.back}
        onAction={() => navigation.goBack()}
        fill
      />
    )
  }

  if (status === PLAN_STATUS.ERROR) return <ErrorState title={TEXTS.errorTitle} error={error} onRetry={reload} fill />

  const statusLabel = TEXTS.statusLabels[plan.status]
  const isPending = (action) => actions.pending === action
  const { queued } = actions
  const isOnline = offline.isOnline && !savedAt
  // Lo que depende del momento y del lugar exactos (asistencia, QR) no se puede dejar pendiente.
  const needsConnection = !isOnline && (can.canCheckIn || can.canShowQr)

  function queuedNotice (item, { pendingText, failedText, action }) {
    if (!item) return null
    if (item.status === 'failed') {
      return (
        <Notice tone='danger' message={`${failedText} ${messageForError(item.error, PLAN_ACTION_MESSAGES[action])}`}>
          <Button title={TEXTS.dismiss} variant='ghost' size='sm' onPress={() => discardQueued(item.id)} style={styles.start} />
        </Notice>
      )
    }
    return (
      <Notice tone='warning' icon='cloud-upload-outline' message={pendingText}>
        {item.status === 'pending'
          ? <Button title={TEXTS.cancelQueued} variant='ghost' size='sm' onPress={() => discardQueued(item.id)} style={styles.start} />
          : null}
      </Notice>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <OfflineNotice savedAt={savedAt} isOnline={offline.isOnline} pendingCount={0} failedCount={offline.failedCount} onOpenPending={openPending} />
      <View style={styles.group}>
        <Text variant='title' accessibilityRole='header'>{plan.title}</Text>
        {/* Falló un refresco: se sigue viendo el plan de antes, con el aviso. */}
        <ErrorBanner title={TEXTS.refreshError} error={refreshError} />
        {statusLabel ? <Notice tone={plan.status === 'cancelled' ? 'danger' : 'warning'} message={statusLabel} /> : null}
        {plan.isFull ? <Notice tone='warning' icon='lock-closed-outline' message={TEXTS.full} /> : null}
      </View>

      <Card style={styles.details}>
        <DetailRow icon='calendar-outline' label={TEXTS.when} value={formatSchedule(plan.startsAt, plan.endsAt)} />
        <DetailRow icon='location-outline' label={TEXTS.where} value={plan.location.label} />
        <DetailRow icon='cash-outline' label={TEXTS.price} value={formatPrice(plan.price)} />
        <DetailRow icon='people-outline' label={TEXTS.spots} value={formatSpots(plan)} />
        <DetailRow icon='person-add-outline' label={TEXTS.joined} value={formatJoined(plan)} />
        <DetailRow icon='pricetags-outline' label={TEXTS.activities} value={activities.join(', ')} />
      </Card>

      {plan.description
        ? (
          <View style={styles.group}>
            <SectionHeader title={TEXTS.about} />
            <Text selectable>{plan.description}</Text>
          </View>
          )
        : null}

      {plan.creator
        ? (
          <Card variant='outlined' style={styles.creator}>
            <Avatar photoUrl={plan.creator.photoUrl} name={plan.creator.name} size={sizes.avatarMd} decorative />
            <View style={styles.creatorText}>
              <Text variant='caption' color='textMuted'>{TEXTS.creator}</Text>
              <Text variant='bodyStrong'>{plan.isCreator ? `${plan.creator.name ?? ''} (${TEXTS.you})` : plan.creator.name}</Text>
              <Text variant='caption' color='textMuted'>{formatReputation(plan.creator.reputation ?? 0)}</Text>
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
          </Card>
          )
        : null}

      <View style={styles.group}>
        {can.isJoined && !can.hasCheckedIn && !can.wasNoShow ? <Notice tone='success' message={TEXTS.joinedNotice} accessibilityLiveRegion='polite' /> : null}
        {can.hasCheckedIn ? <Notice tone='success' message={TEXTS.checkedIn} accessibilityLiveRegion='polite' /> : null}
        {can.wasNoShow ? <Notice tone='warning' message={TEXTS.noShow} /> : null}

        {queuedNotice(queued.join, { pendingText: TEXTS.joinQueued, failedText: TEXTS.joinFailed, action: PLAN_ACTION.JOIN })}
        {queuedNotice(queued.leave, { pendingText: TEXTS.leaveQueued, failedText: TEXTS.leaveFailed, action: PLAN_ACTION.LEAVE })}
        <ErrorBanner error={actions.error} />
        {needsConnection ? <Notice tone='warning' icon='cloud-offline-outline' message={TEXTS.needsConnection} /> : null}

        {can.canJoin && !queued.isWaiting ? <Button title={TEXTS.join} haptic loading={isPending(PLAN_ACTION.JOIN)} disabled={actions.isBusy} onPress={join} /> : null}
        {can.canCheckIn
          ? <Button title={TEXTS.checkIn} icon='qr-code-outline' disabled={!isOnline} onPress={() => navigation.navigate(ROUTES.CHECK_IN, { planId: plan.id })} />
          : null}
        {can.canShowQr
          ? <Button title={TEXTS.showQr} icon='qr-code-outline' disabled={!isOnline} onPress={() => navigation.navigate(ROUTES.PLAN_QR, { planId: plan.id, canCheckIn: can.canCreatorCheckIn })} />
          : null}
        {can.canChat
          ? <Button title={TEXTS.chat} variant='secondary' icon='chatbubbles-outline' onPress={() => navigation.navigate(ROUTES.CHAT, { planId: plan.id, title: plan.title })} />
          : null}
        {can.canLeave && !queued.isWaiting && confirmation.action !== PLAN_ACTION.LEAVE
          ? <Button title={TEXTS.leave} variant='secondary' disabled={actions.isBusy} onPress={askLeave} />
          : null}
        {can.canLeave && !queued.isWaiting && confirmation.action === PLAN_ACTION.LEAVE
          ? <Confirmation action={PLAN_ACTION.LEAVE} isBusy={actions.isBusy} isPending={isPending(PLAN_ACTION.LEAVE)} onConfirm={confirm} onDismiss={dismiss} />
          : null}
      </View>

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
        ? (
          <View style={styles.section}>
            <SectionHeader title={TEXTS.organizer} />
            <Button title={TEXTS.edit} variant='secondary' icon='create-outline' onPress={() => navigation.navigate(ROUTES.EDIT_PLAN, { plan })} />
            {can.canCloseSignUps
              ? <Button title={TEXTS.closeSignUps} variant='secondary' loading={isPending(PLAN_ACTION.CLOSE)} disabled={actions.isBusy} onPress={closeSignUps} />
              : null}
            {can.canReopenSignUps
              ? <Button title={TEXTS.reopenSignUps} variant='secondary' loading={isPending(PLAN_ACTION.REOPEN)} disabled={actions.isBusy} onPress={reopenSignUps} />
              : null}
            {can.canCancel && confirmation.action !== PLAN_ACTION.CANCEL
              ? <Button title={TEXTS.cancelPlan} variant='danger' disabled={actions.isBusy} onPress={askCancel} />
              : null}
            {can.canCancel && confirmation.action === PLAN_ACTION.CANCEL
              ? <Confirmation action={PLAN_ACTION.CANCEL} isBusy={actions.isBusy} isPending={isPending(PLAN_ACTION.CANCEL)} onConfirm={confirm} onDismiss={dismiss} />
              : null}
          </View>
          )
        : null}

      {!plan.isCreator
        ? <Button title={TEXTS.reportPlan} variant='ghost' icon='flag-outline' onPress={() => report({ targetType: 'plan', targetId: plan.id, label: TEXTS.reportPlanLabel })} />
        : null}
    </ScrollView>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xl },
  group: { gap: spacing.sm },
  section: { gap: spacing.md },
  details: { gap: spacing.lg },
  creator: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  creatorText: { flex: 1, gap: spacing.xxs },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  separated: { borderTopWidth: borders.thin, borderTopColor: colors.border },
  personName: { flex: 1 },
  start: { alignSelf: 'flex-start' }
}))
