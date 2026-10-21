import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ChipGroup } from '../components/ChipGroup.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { OfflineNotice } from '../components/OfflineNotice.jsx'
import { PlanCard } from '../components/PlanCard.jsx'
import { PlanCardSkeleton } from '../components/Skeleton.jsx'
import { MY_PLANS_ROLE, MY_PLANS_WHEN, useMyPlans } from '../hooks/useMyPlans.js'
import { useOfflineStatus } from '../hooks/useOffline.js'
import { LIST_STATUS } from '../hooks/usePagedList.js'
import { useRefreshOnFocus } from '../hooks/useScreenFocus.js'
import { ROUTES } from '../navigation/routes.js'
import { createThemedStyles, spacing, useTheme } from '../theme/index.js'
import { formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Mis planes',
  role: 'Mostrar',
  when: 'Cuándo',
  loading: 'Cargando tus planes…',
  loadingMore: 'Cargando más planes…',
  errorTitle: 'No pudimos cargar tus planes.',
  refreshError: 'No pudimos actualizar tus planes.',
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
  joined: 'Inscripción activa',
  findPlans: 'Buscar planes',
  createPlan: 'Crear un plan'
})

// Vacíos que tienen algo para hacer: a qué tab lleva la acción.
const EMPTY_ACTIONS = Object.freeze({
  'joined-upcoming': { title: TEXTS.findPlans, route: ROUTES.FEED_TAB, icon: 'compass-outline' },
  'created-upcoming': { title: TEXTS.createPlan, route: ROUTES.CREATE_TAB, icon: 'add-circle-outline' }
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

/**
 * Cupo o, si corresponde, el estado del plan y el del usuario en él ("Cancelado", "Asististe"…), con el tono de la
 * etiqueta: lo que salió bien en verde, lo que no en ámbar o rojo.
 */
function summaryOf (plan) {
  const parts = []
  let tone
  if (TEXTS.statusLabels[plan.status]) {
    parts.push(TEXTS.statusLabels[plan.status])
    tone = plan.status === 'cancelled' ? 'danger' : 'neutral'
  }
  const mine = plan.myParticipation
  if (mine?.checkedInAt) {
    parts.push(TEXTS.checkedIn)
    tone = 'success'
  } else if (mine?.noShow) {
    parts.push(TEXTS.noShow)
    tone = 'warning'
  } else if (mine?.status === 'active' && parts.length === 0) {
    parts.push(TEXTS.joined)
    tone = 'primary'
  }
  return parts.length > 0 ? { text: parts.join(' · '), tone } : { text: formatSpots(plan), tone: undefined }
}

export default function MyPlansScreen ({ navigation }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const [role, setRole] = useState(MY_PLANS_ROLE.JOINED)
  const [when, setWhen] = useState(MY_PLANS_WHEN.UPCOMING)
  const plans = useMyPlans({ role, when })
  const offline = useOfflineStatus()
  const { loadMore, refresh, retry } = plans

  // Al volver a la pestaña la lista pudo cambiar (inscripciones, bajas, asistencia). Al entrar ya la pide el hook.
  useRefreshOnFocus(navigation, refresh)

  const openPlan = useCallback((planId) => navigation.navigate(ROUTES.PLAN, { planId }), [navigation])

  const renderPlan = useCallback(({ item }) => {
    const summary = summaryOf(item)
    return (
      <PlanCard
        id={item.id}
        title={item.title}
        schedule={formatSchedule(item.startsAt, item.endsAt)}
        place={item.location.label}
        price={formatPrice(item.price)}
        spots={summary.text}
        spotsTone={summary.tone}
        isFull={item.status === 'cancelled' || Boolean(item.myParticipation?.noShow)}
        isFree={item.price === 0}
        onPress={openPlan}
      />
    )
  }, [openPlan])

  const header = (
    <View style={styles.header}>
      <OfflineNotice
        savedAt={plans.savedAt}
        isOnline={offline.isOnline}
        pendingCount={offline.pendingCount}
        failedCount={offline.failedCount}
        onOpenPending={() => navigation.navigate(ROUTES.PENDING_ACTIONS)}
      />
      <ChipGroup label={TEXTS.role} options={ROLES} selected={[role]} onSelect={setRole} variant='segmented' hideLabel />
      <ChipGroup label={TEXTS.when} options={WHENS} selected={[when]} onSelect={setWhen} variant='segmented' hideLabel />
      {plans.refreshError
        ? (
          <View style={styles.refreshError}>
            <ErrorBanner title={TEXTS.refreshError} error={plans.refreshError} />
            <Button title={TEXTS.retry} variant='secondary' size='sm' icon='refresh-outline' onPress={refresh} style={styles.start} />
          </View>
          )
        : null}
    </View>
  )

  const listKey = `${role}-${when}`
  const emptyAction = EMPTY_ACTIONS[listKey]

  function footer () {
    if (plans.isLoadingMore) return <ActivityIndicator accessibilityLabel={TEXTS.loadingMore} color={colors.primary} style={styles.footer} />
    if (plans.loadMoreError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner title={TEXTS.loadMoreError} error={plans.loadMoreError} />
          <Button title={TEXTS.retry} variant='secondary' size='sm' icon='refresh-outline' onPress={loadMore} style={styles.start} />
        </View>
      )
    }
    return null
  }

  return (
    <View style={styles.container}>
      {plans.status === LIST_STATUS.LOADING
        ? (
          <View style={styles.list}>
            {header}
            <PlanCardSkeleton label={TEXTS.loading} />
          </View>
          )
        : null}

      {/* Los filtros siguen arriba del error: permiten cambiar de lista. */}
      {plans.status === LIST_STATUS.ERROR ? <ErrorState title={TEXTS.errorTitle} error={plans.error} onRetry={retry}>{header}</ErrorState> : null}

      {plans.status === LIST_STATUS.READY
        ? (
          <FlatList
            testID='my-plans-list'
            data={plans.items}
            keyExtractor={keyOf}
            renderItem={renderPlan}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            ListEmptyComponent={(
              <EmptyState
                icon={emptyAction?.icon ?? 'calendar-outline'}
                title={TEXTS.emptyTitle}
                message={TEXTS.empty[listKey]}
                actionTitle={emptyAction?.title}
                actionVariant='primary'
                onAction={emptyAction ? () => navigation.navigate(emptyAction.route) : undefined}
              />
            )}
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

const useStyles = createThemedStyles(({ colors }) => ({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.md },
  refreshError: { gap: spacing.sm },
  footer: { paddingVertical: spacing.lg, gap: spacing.sm },
  start: { alignSelf: 'flex-start' }
}))
