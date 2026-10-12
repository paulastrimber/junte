import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ChipGroup } from '../components/ChipGroup.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FeedFilters } from '../components/FeedFilters.jsx'
import { PlanCard } from '../components/PlanCard.jsx'
import { FEED_MODE, FEED_STATUS, useFeed } from '../hooks/useFeed.js'
import { useFeedFilters } from '../hooks/useFeedFilters.js'
import { ROUTES } from '../navigation/routes.js'
import { LOCATION_STATUS } from '../services/location.js'
import { messageForError } from '../utils/errorMessages.js'
import { AVAILABILITY, formatDistance, formatPrice, formatSchedule, formatSpots } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  title: 'Planes',
  section: 'Qué planes ver',
  available: 'Con cupo',
  full: 'Llenos',
  filters: 'Filtros',
  loading: 'Buscando planes…',
  errorTitle: 'No pudimos cargar los planes.',
  retry: 'Reintentar',
  emptyTitle: 'No hay planes para mostrar',
  emptyNearby: 'Probá con una distancia mayor o con menos filtros.',
  emptyByDate: 'Probá con menos filtros, o creá el primero.',
  emptyFull: 'No hay planes llenos con estos filtros.',
  fullHint: 'Estos planes ya no tienen lugar: podés ver el detalle, pero no inscribirte.',
  locationDenied: 'Sin permiso de ubicación mostramos los planes por fecha. Activalo para ver primero los que tenés cerca.',
  locationUnavailable: 'No pudimos obtener tu ubicación: mostramos los planes por fecha.',
  loadingMore: 'Cargando más planes…',
  loadMoreError: 'No pudimos cargar más planes.',
  end: 'No hay más planes.'
})

const SECTIONS = [
  { key: AVAILABILITY.AVAILABLE, label: TEXTS.available },
  { key: AVAILABILITY.FULL, label: TEXTS.full }
]

const keyOf = (plan) => plan.id

export default function HomeScreen ({ navigation }) {
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
      onPress={openPlan}
    />
  ), [openPlan])

  const isFullSection = filters.values.availability === AVAILABILITY.FULL
  const filtersTitle = filters.activeCount > 0 ? `${TEXTS.filters} (${filters.activeCount})` : TEXTS.filters

  const header = (
    <View style={styles.header}>
      <ChipGroup label={TEXTS.section} options={SECTIONS} selected={[filters.values.availability]} onSelect={(key) => setValue('availability', key)} />
      <Button title={filtersTitle} variant='secondary' onPress={() => setAreFiltersOpen(true)} />
      {isFullSection ? <Text style={styles.notice}>{TEXTS.fullHint}</Text> : null}
      {feed.mode === FEED_MODE.BY_DATE
        ? <Text style={styles.notice}>{feed.locationStatus === LOCATION_STATUS.DENIED ? TEXTS.locationDenied : TEXTS.locationUnavailable}</Text>
        : null}
    </View>
  )

  function emptyMessage () {
    if (isFullSection) return TEXTS.emptyFull
    return feed.mode === FEED_MODE.NEARBY ? TEXTS.emptyNearby : TEXTS.emptyByDate
  }

  function footer () {
    if (feed.isLoadingMore) return <ActivityIndicator accessibilityLabel={TEXTS.loadingMore} style={styles.footer} />
    if (feed.loadMoreError) {
      return (
        <View style={styles.footer}>
          <ErrorBanner message={`${TEXTS.loadMoreError} ${messageForError(feed.loadMoreError)}`} requestId={feed.loadMoreError.requestId} />
          {feed.hasMore ? <Button title={TEXTS.retry} variant='secondary' onPress={loadMore} /> : null}
        </View>
      )
    }
    return feed.items.length > 0 && !feed.hasMore ? <Text style={styles.end}>{TEXTS.end}</Text> : null
  }

  return (
    <View style={styles.container}>
      {feed.status === FEED_STATUS.LOADING
        ? (
          <View style={styles.center}>
            {header}
            <ActivityIndicator accessibilityLabel={TEXTS.loading} />
            <Text>{TEXTS.loading}</Text>
          </View>
          )
        : null}

      {feed.status === FEED_STATUS.ERROR
        ? (
          <View style={styles.center}>
            {header}
            <Text style={styles.errorTitle}>{TEXTS.errorTitle}</Text>
            <ErrorBanner message={messageForError(feed.error)} requestId={feed.error?.requestId} />
            <Button title={TEXTS.retry} onPress={retry} />
          </View>
          )
        : null}

      {feed.status === FEED_STATUS.READY
        ? (
          <FlatList
            testID='feed-list'
            data={feed.items}
            keyExtractor={keyOf}
            renderItem={renderPlan}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            ListEmptyComponent={<EmptyState title={TEXTS.emptyTitle} message={emptyMessage()} />}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { padding: 16, gap: 12 },
  header: { gap: 12, marginBottom: 4 },
  list: { padding: 16, gap: 12 },
  notice: { fontSize: 13, color: '#8a5a00', backgroundColor: '#fff6e0', padding: 10, borderRadius: 8 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#b42318' },
  footer: { paddingVertical: 16, gap: 8 },
  end: { textAlign: 'center', color: '#777', paddingVertical: 16 }
})
