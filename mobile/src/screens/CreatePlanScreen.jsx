import { AccessibilityInfo, Keyboard, Platform, StyleSheet, Switch, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateTimeField } from '../components/DateTimeField.jsx'
import { EmptyState } from '../components/EmptyState.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { FieldError } from '../components/FieldError.jsx'
import { successFeedback } from '../components/haptics.js'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { LocationPicker } from '../components/LocationPicker.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { SectionHeader } from '../components/SectionHeader.jsx'
import { Text } from '../components/Text.jsx'
import { useFormScroll } from '../hooks/useFormScroll.js'
import { useKeyboardVisible } from '../hooks/useKeyboardVisible.js'
import { usePlacePicker } from '../hooks/usePlacePicker.js'
import { usePlanForm } from '../hooks/usePlanForm.js'
import { ROUTES } from '../navigation/routes.js'
import { SCREEN_TITLES } from '../navigation/titles.js'
import { spacing, useTheme } from '../theme/index.js'
import { PLAN_LIMITS, defaultEndsAt, formatIssueList, planFormIssues } from '../utils/plans.js'

export const TEXTS = Object.freeze({
  createTitle: SCREEN_TITLES.createPlan,
  editTitle: SCREEN_TITLES.editPlan,
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
  save: 'Guardar cambios',
  requiredLegend: 'Los campos con * son obligatorios.',
  issuesTitleOne: 'Revisá este dato',
  issuesTitleMany: (count) => `Revisá estos ${count} datos`,
  issuesMore: (count) => `y ${count} más`,
  // Nombres cortos para el resumen de errores (algunas etiquetas son largas o dicen "(opcional)").
  fieldNames: Object.freeze({
    title: 'Título',
    description: 'Descripción',
    startsAt: 'Empieza',
    endsAt: 'Termina',
    coordinates: 'Lugar en el mapa',
    locationLabel: 'Nombre del lugar',
    capacity: 'Cupo',
    price: 'Costo',
    interests: 'Tipo de actividad'
  }),
  createErrorTitle: 'No pudimos crear el plan.',
  saveErrorTitle: 'No pudimos guardar los cambios.',
  created: 'Plan creado.',
  saved: 'Cambios guardados.'
})

// Con cupo ilimitado el error de cupo va suelto en la tarjeta (no hay campo): se lleva la vista a la tarjeta entera.
const SCROLL_TARGETS = Object.freeze({ capacity: 'capacityGroup' })

/** Resumen de errores: "Revisá estos 2 datos" + "Título y Empieza.". */
function issuesSummary (issues) {
  const title = issues.length === 1 ? TEXTS.issuesTitleOne : TEXTS.issuesTitleMany(issues.length)
  return { title, message: formatIssueList(issues.map((name) => TEXTS.fieldNames[name]), TEXTS.issuesMore) }
}

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
  const { scrollRef, scrollProps, register, reveal, revealOnNextLayout } = useFormScroll()
  const isKeyboardVisible = useKeyboardVisible()
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { submit, toggleInterest, retryCatalogs } = form
  const { setAddress, searchAddress, pickMyLocation } = place
  const { values, errors } = form
  const errorTitle = form.isEditing ? TEXTS.saveErrorTitle : TEXTS.createErrorTitle

  // El botón está fijo abajo y los errores suelen quedar más arriba: cada envío fallido lleva la vista al primero y
  // se anuncia, también si el resumen ya estaba (no es región viva: si no, se volvería a leer con cada corrección).
  async function handleSubmit () {
    let result
    try {
      result = await submit()
    } catch {
      return
    }
    if (result.status === 'saved') {
      successFeedback()
      AccessibilityInfo.announceForAccessibility(form.isEditing ? TEXTS.saved : TEXTS.created)
      return
    }
    if (result.status !== 'invalid' && result.status !== 'failed') return
    const announcements = []
    if (result.fields.length > 0) {
      const [first] = result.fields
      reveal(SCROLL_TARGETS[first] ?? first, { align: 'top' })
      const summary = issuesSummary(result.fields)
      announcements.push(`${summary.title}: ${summary.message}`)
    }
    // En Android el error general lo anuncia la región viva del `ErrorBanner`; en iOS hay que hacerlo a mano.
    if (result.formError && Platform.OS === 'ios') announcements.push(`${errorTitle} ${result.formError.message}`)
    if (announcements.length > 0) AccessibilityInfo.announceForAccessibility(announcements.join(' '))
  }

  // Al terminar de buscar (encontrado o no) se muestra el mapa con el pin o el aviso.
  async function findAndReveal (find) {
    await find()
    reveal('coordinates')
  }
  function handleSearch () {
    // Con el teclado abierto el mapa no entra en lo que queda visible.
    Keyboard.dismiss()
    findAndReveal(searchAddress)
  }
  function handleUseMyLocation () {
    findAndReveal(pickMyLocation)
  }

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

  // El botón queda fijo abajo: el formulario es largo y guardar tiene que estar siempre a mano. El resumen de errores
  // y el error general van justo arriba, donde la persona acaba de tocar. Con el teclado abierto el resumen se
  // esconde para no comerse la pantalla (cada campo sigue mostrando su error).
  const issues = planFormIssues(errors)
  const summary = issues.length > 0 && !isKeyboardVisible ? issuesSummary(issues) : null
  const footer = (
    <>
      {summary ? <Notice tone='danger' title={summary.title} message={summary.message} accessible accessibilityRole='alert' /> : null}
      <ErrorBanner title={errorTitle} error={form.formError} />
      <Button title={form.isEditing ? TEXTS.save : TEXTS.create} onPress={handleSubmit} loading={form.isSaving} haptic />
    </>
  )

  // Cada bloque se envuelve en un `View` que registra su posición: así se puede scrollear al primer error.
  return (
    <Screen footer={footer} scrollRef={scrollRef} {...scrollProps}>
      <Text variant='caption' color='textMuted'>{TEXTS.requiredLegend}</Text>
      <View onLayout={register('title')}>
        <FormField
          label={TEXTS.title}
          value={values.title}
          onChangeText={(text) => form.setValue('title', text)}
          error={errors.title}
          maxLength={PLAN_LIMITS.TITLE_MAX}
          editable={!form.isSaving}
          required
        />
      </View>
      <View onLayout={register('description')}>
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
      </View>

      {/* En iOS el selector se despliega en línea: al abrirlo se muestra entero. */}
      <View onLayout={register('startsAt')}>
        <DateTimeField
          label={TEXTS.startsAt}
          value={values.startsAt}
          onChange={(date) => form.setValue('startsAt', date)}
          minimumDate={new Date()}
          error={errors.startsAt}
          onOpenChange={(isOpen) => { if (isOpen) revealOnNextLayout('startsAt') }}
          required
        />
      </View>
      <View onLayout={register('endsAt')}>
        <DateTimeField
          label={TEXTS.endsAt}
          value={values.endsAt}
          onChange={(date) => form.setValue('endsAt', date)}
          minimumDate={values.startsAt ?? new Date()}
          defaultDate={defaultEndsAt(values.startsAt)}
          error={errors.endsAt}
          onOpenChange={(isOpen) => { if (isOpen) revealOnNextLayout('endsAt') }}
          required
        />
      </View>

      <View onLayout={register('coordinates')} style={styles.block}>
        <SectionHeader title={TEXTS.place} style={styles.section} required />
        <LocationPicker
          coordinates={values.coordinates}
          onChange={(coordinates) => form.setValue('coordinates', coordinates)}
          address={place.address}
          onAddressChange={setAddress}
          onSearch={handleSearch}
          onUseMyLocation={handleUseMyLocation}
          isWorking={place.isWorking}
          message={place.message}
          error={errors.coordinates}
        />
      </View>
      <View onLayout={register('locationLabel')}>
        <FormField
          label={TEXTS.locationLabel}
          placeholder={TEXTS.locationLabelPlaceholder}
          value={values.locationLabel}
          onChangeText={(text) => form.setValue('locationLabel', text)}
          error={errors.locationLabel}
          maxLength={PLAN_LIMITS.LABEL_MAX}
          editable={!form.isSaving}
          required
        />
      </View>

      <View onLayout={register('capacityGroup')}>
        <Card variant='outlined' style={styles.group}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text variant='label'>{TEXTS.unlimited}</Text>
              <Text variant='caption' color='textMuted'>{TEXTS.unlimitedHint}</Text>
            </View>
            <Switch
              accessibilityLabel={TEXTS.unlimited}
              value={values.isUnlimited}
              onValueChange={(isOn) => {
                form.setValue('isUnlimited', isOn)
                // Aparece el campo de cupo: se muestra cuando la tarjeta crece, sin enfocarlo (no abre el teclado).
                if (!isOn) revealOnNextLayout('capacityGroup')
              }}
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
                required
              />
              )
            : null}
          {/* Con cupo ilimitado el campo no está: el error del servidor (p. ej. menos lugares que inscriptos) va suelto. */}
          {values.isUnlimited ? <FieldError message={errors.capacity} /> : null}

          <View onLayout={register('price', { parent: 'capacityGroup' })}>
            {/* Obligatorio aunque venga con 0: no puede quedar vacío. */}
            <FormField
              label={TEXTS.price}
              value={values.price}
              onChangeText={(text) => form.setValue('price', text)}
              error={errors.price}
              keyboardType='number-pad'
              maxLength={6}
              editable={!form.isSaving}
              required
            />
          </View>
        </Card>
      </View>

      <View onLayout={register('interests')} style={styles.block}>
        <SectionHeader title={TEXTS.interests} style={styles.section} required />
        <CatalogGate status={form.catalogStatus} onRetry={retryCatalogs}>
          <InterestPicker categories={form.interestCategories} selected={values.interests} onToggle={toggleInterest} />
        </CatalogGate>
        <FieldError message={errors.interests} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.sm },
  // Mismo espacio que entre los hijos de `Screen`: agrupar para medir no cambia cómo se ve.
  block: { gap: spacing.lg },
  group: { gap: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchText: { flex: 1, gap: spacing.xxs }
})
