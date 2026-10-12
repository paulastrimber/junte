import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { useCatalogs } from '../hooks/useCatalogs.js'
import { PLAN_STATUS, usePlan } from '../hooks/usePlan.js'
import { ROUTES } from '../navigation/routes.js'
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

export default function PlanScreen ({ navigation, route }) {
  // `version` cambia cuando se vuelve de editar: fuerza a pedir el plan otra vez.
  const { planId, version = 0 } = route.params
  const { status, plan, error, reload } = usePlan(planId, version)
  const { catalog } = useCatalogs()

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
            </View>
          </View>
          )
        : null}

      {plan.isCreator
        ? <Button title={TEXTS.edit} variant='secondary' onPress={() => navigation.navigate(ROUTES.EDIT_PLAN, { plan })} />
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
  errorTitle: { fontSize: 16, fontWeight: '600', color: '#b42318' }
})
