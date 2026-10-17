import { StyleSheet, Switch, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateTimeField } from '../components/DateTimeField.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { FieldError } from '../components/FieldError.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { LocationPicker } from '../components/LocationPicker.jsx'
import { Screen } from '../components/Screen.jsx'
import { SectionHeader } from '../components/SectionHeader.jsx'
import { Text } from '../components/Text.jsx'
import { usePlacePicker } from '../hooks/usePlacePicker.js'
import { usePlanForm } from '../hooks/usePlanForm.js'
import { ROUTES } from '../navigation/routes.js'
import { spacing, useTheme } from '../theme/index.js'
import { PLAN_LIMITS, defaultEndsAt } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  createTitle: 'Crear plan',
  editTitle: 'Editar plan',
  incompleteTitle: 'Completá tu perfil para crear planes',
  incompleteMessage: 'Necesitás tu nombre, tu fecha de nacimiento y al menos un interés.',
  goToProfile: 'Ir a mi perfil',
  title: 'Título',
  description: 'Descripción (opcional)',
  descriptionHint: 'Lo ven quienes miran el plan.',
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

export default function CreatePlanScreen ({ navigation, route }) {
  const { colors } = useTheme()
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
        icon='person-circle-outline'
        title={TEXTS.incompleteTitle}
        message={TEXTS.incompleteMessage}
        actionTitle={TEXTS.goToProfile}
        actionVariant='primary'
        onAction={() => navigation.navigate(ROUTES.PROFILE_TAB)}
        fill
      />
    )
  }

  // El botón queda fijo abajo: el formulario es largo y guardar tiene que estar siempre a mano.
  const footer = <Button title={form.isEditing ? TEXTS.save : TEXTS.create} onPress={submit} loading={form.isSaving} haptic />

  return (
    <Screen footer={footer}>
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
        hint={TEXTS.descriptionHint}
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
        defaultDate={defaultEndsAt(values.startsAt)}
        error={errors.endsAt}
      />

      <SectionHeader title={TEXTS.place} style={styles.section} />
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

      <Card variant='outlined' style={styles.group}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text variant='label'>{TEXTS.unlimited}</Text>
            <Text variant='caption' color='textMuted'>{TEXTS.unlimitedHint}</Text>
          </View>
          <Switch
            accessibilityLabel={TEXTS.unlimited}
            value={values.isUnlimited}
            onValueChange={(isOn) => form.setValue('isUnlimited', isOn)}
            disabled={form.isSaving}
            trackColor={{ true: colors.primary }}
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
        {/* Con cupo ilimitado el campo no está: el error del servidor (p. ej. menos lugares que inscriptos) va suelto. */}
        {values.isUnlimited ? <FieldError message={errors.capacity} /> : null}

        <FormField
          label={TEXTS.price}
          value={values.price}
          onChangeText={(text) => form.setValue('price', text)}
          error={errors.price}
          keyboardType='number-pad'
          maxLength={6}
          editable={!form.isSaving}
        />
      </Card>

      <SectionHeader title={TEXTS.interests} style={styles.section} />
      <CatalogGate status={form.catalogStatus} onRetry={retryCatalogs}>
        <InterestPicker categories={form.interestCategories} selected={values.interests} onToggle={toggleInterest} />
      </CatalogGate>
      <FieldError message={errors.interests} />

      <ErrorBanner error={form.formError} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.sm },
  group: { gap: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchText: { flex: 1, gap: spacing.xxs }
})
