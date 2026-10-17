import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ChipGroup } from '../components/ChipGroup.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { ErrorState } from '../components/ErrorState.jsx'
import { FeedFilters } from '../components/FeedFilters.jsx'
import { Notice } from '../components/Notice.jsx'
import { PlanCard } from '../components/PlanCard.jsx'
import { PlanCardSkeleton } from '../components/Skeleton.jsx'
import { Text } from '../components/Text.jsx'
import { FEED_MODE, FEED_STATUS, LOCATION_NOTICE, useFeed } from '../hooks/useFeed.js'
import { useFeedFilters } from '../hooks/useFeedFilters.js'
import { ROUTES } from '../navigation/routes.js'
import { createThemedStyles, spacing, useTheme } from '../theme/index.js'
import { AVAILABILITY, formatDistance, formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Planes',
  section: 'Qué planes ver',
  available: 'Con cupo',
  full: 'Llenos',
  filters: 'Filtros',
  filtersActive: (count) => `Filtros, ${count} ${count === 1 ? 'activo' : 'activos'}`,
  loading: 'Buscando planes…',
  errorTitle: 'No pudimos cargar los planes.',
  retry: 'Reintentar',
  emptyTitle: 'No hay planes para mostrar',
  emptyNearby: 'Probá con una distancia mayor o con menos filtros.',
  emptyByDate: 'Probá con menos filtros, o creá el primero.',
  emptyFull: 'No hay planes llenos con estos filtros.',
  create: 'Crear un plan',
  fullHint: 'Estos planes ya no tienen lugar: podés ver el detalle, pero no inscribirte.',
  locationDenied: 'Sin permiso de ubicación mostramos los planes por fecha. Activalo para ver primero los que tenés cerca.',
  locationUnavailable: 'No pudimos obtener tu ubicación: mostramos los planes por fecha.',
  refreshError: 'No pudimos actualizar los planes.',
  loadingMore: 'Cargando más planes…',
  loadMoreError: 'No pudimos cargar más planes.',
  end: 'No hay más planes.'
})

const SECTIONS = [
  { key: AVAILABILITY.AVAILABLE, label: TEXTS.available },
  { key: AVAILABILITY.FULL, label: TEXTS.full }
]

const LOCATION_TEXTS = Object.freeze({
  [LOCATION_NOTICE.DENIED]: TEXTS.locationDenied,
  [LOCATION_NOTICE.UNAVAILABLE]: TEXTS.locationUnavailable
})

const keyOf = (plan) => plan.id

export default function HomeScreen ({ navigation }) {
  const styles = useStyles()
  const { colors } = useTheme()
  const filters = useFeedFilters()
  const feed = useFeed({ query: filters.query, radiusKm: filters.radiusKm })
  const [areFiltersOpen, setAreFiltersOpen] = useState(false)
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { loadMore, refresh, retry } = feed
  const { setValue, toggleInterest, togglePriceRange, reset } = filters

  const openPlan = useCallback((planId) => navigation.navigate(ROUTES.PLAN, { planId }), [navigation])
  const renderPlan = useCallback(({ item }) => (
    <PlanCard
      id={item.id}
      title={item.title}
      schedule={formatSchedule(item.startsAt, item.endsAt)}
      place={item.location.label}
      distance={item.distanceMeters !== undefined ? formatDistance(item.distanceMeters) : undefined}
      price={formatPrice(item.price)}
      spots={formatSpots(item)}
      isFull={item.isFull}
      isFree={item.price === 0}
      onPress={openPlan}
    />
  ), [openPlan])

  const isFullSection = filters.values.availability === AVAILABILITY.FULL
  const activeCount = filters.activeCount
  const filtersTitle = activeCount > 0 ? `${TEXTS.filters} (${activeCount})` : TEXTS.filters

  const header = (
    <View style={styles.header}>
      <View style={styles.toolbar}>
        <View style={styles.sections}>
          <ChipGroup label={TEXTS.section} options={SECTIONS} selected={[filters.values.availability]} onSelect={(key) => setValue('availability', key)} variant='segmented' hideLabel />
        </View>
        <Button
          title={filtersTitle}
          accessibilityLabel={activeCount > 0 ? TEXTS.filtersActive(activeCount) : TEXTS.filters}
          variant='secondary'
          size='sm'
          icon='options-outline'
          onPress={() => setAreFiltersOpen(true)}
        />
      </View>
      {isFullSection ? <Notice tone='info' icon='lock-closed-outline' message={TEXTS.fullHint} /> : null}
      {feed.locationNotice ? <Notice tone='warning' icon='location-outline' message={LOCATION_TEXTS[feed.locationNotice]} /> : null}
      {feed.refreshError
        ? (
          <View style={styles.refreshError}>
            <ErrorBanner title={TEXTS.refreshError} error={feed.refreshError} />
            <Button title={TEXTS.retry} variant='secondary' size='sm' icon='refresh-outline' onPress={refresh} style={styles.start} />
          </View>
          )
        : null}
    </View>
  )

  function empty () {
    if (isFullSection) return <EmptyState title={TEXTS.emptyTitle} message={TEXTS.emptyFull} />
    if (feed.mode === FEED_MODE.NEARBY) return <EmptyState title={TEXTS.emptyTitle} message={TEXTS.emptyNearby} />
    // Por fecha no hay distancia que agrandar: la invitación es armar uno.
    return (
      <EmptyState
        icon='add-circle-outline'
        title={TEXTS.emptyTitle}
        message={TEXTS.emptyByDate}
        actionTitle={TEXTS.create}
        actionVariant='primary'
        onAction={() => navigation.navigate(ROUTES.CREATE_TAB)}
      />
    )
  }

  function footer () {
    if (feed.isLoadingMore) return <ActivityIndicator accessibilityLabel={TEXTS.loadingMore} color={colors.primary} style={styles.footer} />
    if (feed.loadMoreError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner title={TEXTS.loadMoreError} error={feed.loadMoreError} />
          <Button title={TEXTS.retry} variant='secondary' size='sm' icon='refresh-outline' onPress={loadMore} style={styles.start} />
        </View>
      )
    }
    return feed.items.length > 0 && !feed.hasMore ? <Text variant='caption' color='textMuted' center style={styles.footer}>{TEXTS.end}</Text> : null
  }

  return (
    <View style={styles.container}>
      {feed.status === FEED_STATUS.LOADING
        ? (
          <View style={styles.list}>
            {header}
            <PlanCardSkeleton label={TEXTS.loading} />
          </View>
          )
        : null}

      {/* Los filtros siguen arriba del error: a veces cambiarlos es la salida. */}
      {feed.status === FEED_STATUS.ERROR ? <ErrorState title={TEXTS.errorTitle} error={feed.error} onRetry={retry}>{header}</ErrorState> : null}

      {feed.status === FEED_STATUS.READY
        ? (
          <FlatList
            testID='feed-list'
            data={feed.items}
            keyExtractor={keyOf}
            renderItem={renderPlan}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            ListEmptyComponent={empty()}
            ListFooterComponent={footer()}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            refreshing={feed.isRefreshing}
            onRefresh={refresh}
          />
          )
        : null}

      <FeedFilters
        visible={areFiltersOpen}
        onClose={() => setAreFiltersOpen(false)}
        values={filters.values}
        priceRangeOptions={filters.priceRangeOptions}
        interestCategories={filters.interestCategories}
        onChange={setValue}
        onToggleInterest={toggleInterest}
        onTogglePriceRange={togglePriceRange}
        onReset={reset}
      />
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { gap: spacing.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sections: { flex: 1 },
  refreshError: { gap: spacing.sm },
  footer: { paddingVertical: spacing.lg, gap: spacing.sm },
  start: { alignSelf: 'flex-start' }
}))
