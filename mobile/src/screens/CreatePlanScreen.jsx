import { StyleSheet, Switch, Text, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateTimeField } from '../components/DateTimeField.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { LocationPicker } from '../components/LocationPicker.jsx'
import { Screen } from '../components/Screen.jsx'
import { usePlacePicker } from '../hooks/usePlacePicker.js'
import { usePlanForm } from '../hooks/usePlanForm.js'
import { ROUTES } from '../navigation/routes.js'
import { PLAN_LIMITS } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  createTitle: 'Crear plan',
  editTitle: 'Editar plan',
  incompleteTitle: 'Completá tu perfil para crear planes',
  incompleteMessage: 'Necesitás tu nombre, tu fecha de nacimiento y al menos un interés.',
  goToProfile: 'Ir a mi perfil',
  title: 'Título',
  description: 'Descripción (opcional)',
  startsAt: 'Empieza',
  endsAt: 'Termina',
  place: 'Lugar',
  locationLabel: 'Nombre del lugar',
  locationLabelPlaceholder: 'Ej.: Cancha del campus',
  unlimited: 'Cupo ilimitado',
  unlimitedHint: 'Sin límite: se puede inscribir cualquier cantidad de personas.',
  capacity: 'Cupo (cantidad de personas)',
  price: 'Costo por persona en pesos (0 = gratis)',
  interests: 'Tipo de actividad',
  create: 'Crear plan',
  save: 'Guardar cambios'
})

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export default function CreatePlanScreen ({ navigation, route }) {
  const plan = route.params?.plan ?? null

  // El plan solo se da por guardado cuando el servidor responde: recién ahí se navega al detalle.
  function showSaved (saved) {
    if (plan) navigation.popTo(ROUTES.PLAN, { planId: saved.id, version: Date.now() })
    else navigation.navigate(ROUTES.FEED_TAB, { screen: ROUTES.PLAN, params: { planId: saved.id }, initial: false })
  }

  const form = usePlanForm({ plan, onSaved: showSaved })
  const place = usePlacePicker((coordinates) => form.setValue('coordinates', coordinates))
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { submit, toggleInterest, retryCatalogs } = form
  const { setAddress, searchAddress, pickMyLocation } = place
  const { values, errors } = form

  if (!form.isEditing && !form.canCreate) {
    return (
      <EmptyState
        title={TEXTS.incompleteTitle}
        message={TEXTS.incompleteMessage}
        actionTitle={TEXTS.goToProfile}
        onAction={() => navigation.navigate(ROUTES.PROFILE_TAB)}
      />
    )
  }

  return (
    <Screen>
      <FormField
        label={TEXTS.title}
        value={values.title}
        onChangeText={(text) => form.setValue('title', text)}
        error={errors.title}
        maxLength={PLAN_LIMITS.TITLE_MAX}
        editable={!form.isSaving}
      />
      <FormField
        label={TEXTS.description}
        value={values.description}
        onChangeText={(text) => form.setValue('description', text)}
        error={errors.description}
        maxLength={PLAN_LIMITS.DESCRIPTION_MAX}
        multiline
        editable={!form.isSaving}
      />

      <DateTimeField
        label={TEXTS.startsAt}
        value={values.startsAt}
        onChange={(date) => form.setValue('startsAt', date)}
        minimumDate={new Date()}
        error={errors.startsAt}
      />
      <DateTimeField
        label={TEXTS.endsAt}
        value={values.endsAt}
        onChange={(date) => form.setValue('endsAt', date)}
        minimumDate={values.startsAt ?? new Date()}
        defaultDate={values.startsAt ? new Date(values.startsAt.getTime() + TWO_HOURS_MS) : undefined}
        error={errors.endsAt}
      />

      <Text style={styles.sectionLabel} accessibilityRole='header'>{TEXTS.place}</Text>
      <LocationPicker
        coordinates={values.coordinates}
        onChange={(coordinates) => form.setValue('coordinates', coordinates)}
        address={place.address}
        onAddressChange={setAddress}
        onSearch={searchAddress}
        onUseMyLocation={pickMyLocation}
        isWorking={place.isWorking}
        message={place.message}
        error={errors.coordinates}
      />
      <FormField
        label={TEXTS.locationLabel}
        placeholder={TEXTS.locationLabelPlaceholder}
        value={values.locationLabel}
        onChangeText={(text) => form.setValue('locationLabel', text)}
        error={errors.locationLabel}
        maxLength={PLAN_LIMITS.LABEL_MAX}
        editable={!form.isSaving}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.sectionLabel}>{TEXTS.unlimited}</Text>
          <Text style={styles.hint}>{TEXTS.unlimitedHint}</Text>
        </View>
        <Switch
          accessibilityLabel={TEXTS.unlimited}
          value={values.isUnlimited}
          onValueChange={(isOn) => form.setValue('isUnlimited', isOn)}
          disabled={form.isSaving}
        />
      </View>
      {!values.isUnlimited
        ? (
          <FormField
            label={TEXTS.capacity}
            value={values.capacity}
            onChangeText={(text) => form.setValue('capacity', text)}
            error={errors.capacity}
            keyboardType='number-pad'
            maxLength={3}
            editable={!form.isSaving}
          />
          )
        : null}
      {values.isUnlimited && errors.capacity ? <Text style={styles.error} accessibilityRole='alert'>{errors.capacity}</Text> : null}

      <FormField
        label={TEXTS.price}
        value={values.price}
        onChangeText={(text) => form.setValue('price', text)}
        error={errors.price}
        keyboardType='number-pad'
        maxLength={6}
        editable={!form.isSaving}
      />

      <Text style={styles.sectionLabel} accessibilityRole='header'>{TEXTS.interests}</Text>
      <CatalogGate status={form.catalogStatus} onRetry={retryCatalogs}>
        <InterestPicker categories={form.interestCategories} selected={values.interests} onToggle={toggleInterest} />
      </CatalogGate>
      {errors.interests ? <Text style={styles.error} accessibilityRole='alert'>{errors.interests}</Text> : null}

      <ErrorBanner message={form.formError?.message} requestId={form.formError?.requestId} />
      <Button title={form.isEditing ? TEXTS.save : TEXTS.create} onPress={submit} loading={form.isSaving} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  hint: { fontSize: 12, color: '#666' },
  error: { color: '#b42318', fontSize: 13 }
})
