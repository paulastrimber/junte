import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ChipGroup } from '../components/ChipGroup.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { PlanCard } from '../components/PlanCard.jsx'
import { MY_PLANS_ROLE, MY_PLANS_WHEN, useMyPlans } from '../hooks/useMyPlans.js'
import { LIST_STATUS } from '../hooks/usePagedList.js'
import { ROUTES } from '../navigation/routes.js'
import { messageForError } from '../utils/errorMessages.js'
import { formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Mis planes',
  role: 'Mostrar',
  when: 'Cuándo',
  loading: 'Cargando tus planes…',
  loadingMore: 'Cargando más planes…',
  errorTitle: 'No pudimos cargar tus planes.',
  loadMoreError: 'No pudimos cargar más planes.',
  retry: 'Reintentar',
  emptyTitle: 'No hay planes para mostrar',
  empty: {
    'joined-upcoming': 'Todavía no te inscribiste en ningún plan. Buscá uno en la pestaña Planes.',
    'joined-past': 'Acá van a aparecer los planes a los que fuiste.',
    'created-upcoming': 'No tenés planes próximos creados por vos. Podés armar uno en la pestaña Crear.',
    'created-past': 'Acá van a aparecer los planes que organizaste.'
  },
  statusLabels: { closed: 'Inscripciones cerradas', cancelled: 'Cancelado', completed: 'Finalizado' },
  checkedIn: 'Asististe',
  noShow: 'No asististe',
  joined: 'Inscripto'
})

const ROLES = Object.freeze([
  { key: MY_PLANS_ROLE.JOINED, label: 'Voy' },
  { key: MY_PLANS_ROLE.CREATED, label: 'Organizo' }
])

const WHENS = Object.freeze([
  { key: MY_PLANS_WHEN.UPCOMING, label: 'Próximos' },
  { key: MY_PLANS_WHEN.PAST, label: 'Pasados' }
])

const keyOf = (plan) => plan.id

/** Cupo o, si corresponde, el estado del plan y el del usuario en él ("Cancelado", "Asististe"…). */
function summaryOf (plan) {
  const parts = []
  if (TEXTS.statusLabels[plan.status]) parts.push(TEXTS.statusLabels[plan.status])
  const mine = plan.myParticipation
  if (mine?.checkedInAt) parts.push(TEXTS.checkedIn)
  else if (mine?.noShow) parts.push(TEXTS.noShow)
  else if (mine?.status === 'active' && parts.length === 0) parts.push(TEXTS.joined)
  return parts.length > 0 ? parts.join(' · ') : formatSpots(plan)
}

export default function MyPlansScreen ({ navigation }) {
  const [role, setRole] = useState(MY_PLANS_ROLE.JOINED)
  const [when, setWhen] = useState(MY_PLANS_WHEN.UPCOMING)
  const plans = useMyPlans({ role, when })
  const { loadMore, refresh, retry } = plans

  // Al volver a la pestaña la lista pudo cambiar (inscripciones, bajas, asistencia).
  useEffect(() => navigation.addListener('focus', refresh), [navigation, refresh])

  const openPlan = useCallback((planId) => navigation.navigate(ROUTES.PLAN, { planId }), [navigation])

  const renderPlan = useCallback(({ item }) => (
    <PlanCard
      id={item.id}
      title={item.title}
      schedule={formatSchedule(item.startsAt, item.endsAt)}
      place={item.location.label}
      price={formatPrice(item.price)}
      spots={summaryOf(item)}
      isFull={item.status === 'cancelled' || Boolean(item.myParticipation?.noShow)}
      onPress={openPlan}
    />
  ), [openPlan])

  const header = (
    <View style={styles.header}>
      <ChipGroup label={TEXTS.role} options={ROLES} selected={[role]} onSelect={setRole} />
      <ChipGroup label={TEXTS.when} options={WHENS} selected={[when]} onSelect={setWhen} />
    </View>
  )

  function footer () {
    if (plans.isLoadingMore) return <ActivityIndicator accessibilityLabel={TEXTS.loadingMore} style={styles.footer} />
    if (plans.loadMoreError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner message={`${TEXTS.loadMoreError} ${messageForError(plans.loadMoreError)}`} requestId={plans.loadMoreError.requestId} />
          {plans.hasMore ? <Button title={TEXTS.retry} variant='secondary' onPress={loadMore} /> : null}
        </View>
      )
    }
    return null
  }

  return (
    <View style={styles.container}>
      {plans.status === LIST_STATUS.LOADING
        ? (
          <View style={styles.center}>
            {header}
            <ActivityIndicator accessibilityLabel={TEXTS.loading} />
            <Text>{TEXTS.loading}</Text>
          </View>
          )
        : null}

      {plans.status === LIST_STATUS.ERROR
        ? (
          <View style={styles.center}>
            {header}
            <Text style={styles.errorTitle}>{TEXTS.errorTitle}</Text>
            <ErrorBanner message={messageForError(plans.error)} requestId={plans.error?.requestId} />
            <Button title={TEXTS.retry} onPress={retry} />
          </View>
          )
        : null}

      {plans.status === LIST_STATUS.READY
        ? (
          <FlatList
            testID='my-plans-list'
            data={plans.items}
            keyExtractor={keyOf}
            renderItem={renderPlan}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            ListEmptyComponent={<EmptyState title={TEXTS.emptyTitle} message={TEXTS.empty[`${role}-${when}`]} />}
            ListFooterComponent={footer()}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshing={plans.isRefreshing}
            onRefresh={refresh}
          />
          )
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { padding: 16, gap: 12 },
  header: { gap: 12, marginBottom: 4 },
  list: { padding: 16, gap: 12 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#b42318' },
  footer: { paddingVertical: 16, gap: 8 }
})
