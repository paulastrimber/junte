import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateField } from '../components/DateField.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { Screen } from '../components/Screen.jsx'
import { SelectField } from '../components/SelectField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useOnboarding } from '../hooks/useOnboarding.js'
import { useProfilePhoto } from '../hooks/useProfilePhoto.js'
import { MAX_INTERESTS, RECOMMENDED_INTERESTS } from '../utils/catalog.js'

export const TEXTS = Object.freeze({
  progress: (step, total) => `Paso ${step} de ${total}`,
  aboutHint: 'Todo es opcional: podés saltar este paso y completarlo después desde tu perfil.',
  birthDate: 'Fecha de nacimiento',
  photo: 'Elegir foto',
  changePhoto: 'Cambiar foto',
  uploadingPhoto: 'Subiendo foto…',
  university: 'Universidad',
  career: 'Carrera',
  city: 'Ciudad',
  neighborhood: 'Barrio',
  careerHintNoUniversity: 'Elegí primero una universidad.',
  careerHintOther: 'No tenemos las carreras de esa universidad.',
  neighborhoodHintNoCity: 'Elegí primero una ciudad.',
  neighborhoodHintOther: 'Solo tenemos barrios de Montevideo.',
  interestsHint: `Elegí hasta ${MAX_INTERESTS}. Con al menos ${RECOMMENDED_INTERESTS} te recomendamos mejores planes.`,
  interestsCount: (count) => `${count} de ${MAX_INTERESTS} elegidos`,
  back: 'Atrás',
  next: 'Siguiente',
  finish: 'Finalizar',
  skip: 'Saltar este paso',
  later: 'Más tarde'
})

function AboutStep ({ values, errors, setValue }) {
  const { user } = useAuth()
  const photo = useProfilePhoto()
  const { choosePhoto } = photo
  return (
    <View style={styles.stepBody}>
      <Text style={styles.hint}>{TEXTS.aboutHint}</Text>
      <View style={styles.center}>
        <Avatar photoUrl={user.photoUrl} name={user.name} />
        <Button
          title={photo.isUploading ? TEXTS.uploadingPhoto : (user.photoUrl ? TEXTS.changePhoto : TEXTS.photo)}
          variant='secondary'
          loading={photo.isUploading}
          onPress={choosePhoto}
        />
        <ErrorBanner message={photo.error} />
      </View>
      <DateField label={TEXTS.birthDate} value={values.birthDate} onChange={(value) => setValue('birthDate', value)} error={errors.birthDate} />
    </View>
  )
}

function StudyStep ({ values, options, errors, setValue }) {
  const careerDisabled = options.careers.length === 0
  const careerHint = !values.university ? TEXTS.careerHintNoUniversity : (careerDisabled ? TEXTS.careerHintOther : undefined)
  const neighborhoodDisabled = options.neighborhoods.length === 0
  const neighborhoodHint = !values.city ? TEXTS.neighborhoodHintNoCity : (neighborhoodDisabled ? TEXTS.neighborhoodHintOther : undefined)
  return (
    <View style={styles.stepBody}>
      <SelectField label={TEXTS.university} value={values.university} options={options.universities} onChange={(key) => setValue('university', key)} error={errors.university} />
      <SelectField
        label={TEXTS.career}
        value={values.career}
        options={options.careers}
        allowOther={!careerDisabled}
        disabled={careerDisabled}
        hint={careerHint}
        onChange={(key) => setValue('career', key)}
        error={errors.career}
      />
      <SelectField label={TEXTS.city} value={values.city} options={options.cities} onChange={(key) => setValue('city', key)} error={errors.city} />
      <SelectField
        label={TEXTS.neighborhood}
        value={values.neighborhood}
        options={options.neighborhoods}
        allowOther={!neighborhoodDisabled}
        disabled={neighborhoodDisabled}
        hint={neighborhoodHint}
        onChange={(key) => setValue('neighborhood', key)}
        error={errors.neighborhood}
      />
    </View>
  )
}

function InterestsStep ({ values, options, errors, toggleInterest }) {
  return (
    <View style={styles.stepBody}>
      <Text style={styles.hint}>{TEXTS.interestsHint}</Text>
      <Text style={styles.counter} accessibilityLiveRegion='polite'>{TEXTS.interestsCount(values.interests.length)}</Text>
      <InterestPicker categories={options.interestCategories} selected={values.interests} onToggle={toggleInterest} />
      {errors.interests ? <Text style={styles.error} accessibilityRole='alert'>{errors.interests}</Text> : null}
    </View>
  )
}

/** Onboarding de primer ingreso: 3 pasos, todos salteables, con "Más tarde" para salir en cualquier momento. */
export default function OnboardingScreen () {
  const flow = useOnboarding()
  const { next, skip, back, later, retryCatalogs } = flow

  return (
    <Screen>
      <View accessible accessibilityRole='progressbar' accessibilityLabel={TEXTS.progress(flow.stepIndex + 1, flow.stepCount)} accessibilityValue={{ min: 1, max: flow.stepCount, now: flow.stepIndex + 1 }} style={styles.progress}>
        <Text style={styles.progressText}>{TEXTS.progress(flow.stepIndex + 1, flow.stepCount)}</Text>
        <View style={styles.bars}>
          {Array.from({ length: flow.stepCount }, (_, i) => (
            <View key={i} style={[styles.bar, i <= flow.stepIndex && styles.barDone]} />
          ))}
        </View>
      </View>
      <Text style={styles.title} accessibilityRole='header'>{flow.step.title}</Text>

      {flow.step.id === 'about' ? <AboutStep values={flow.values} errors={flow.errors} setValue={flow.setValue} /> : null}
      {flow.step.id === 'study'
        ? (
          <CatalogGate status={flow.catalogStatus} onRetry={retryCatalogs}>
            <StudyStep values={flow.values} options={flow.options} errors={flow.errors} setValue={flow.setValue} />
          </CatalogGate>
          )
        : null}
      {flow.step.id === 'interests'
        ? (
          <CatalogGate status={flow.catalogStatus} onRetry={retryCatalogs}>
            <InterestsStep values={flow.values} options={flow.options} errors={flow.errors} toggleInterest={flow.toggleInterest} />
          </CatalogGate>
          )
        : null}

      <ErrorBanner message={flow.formError?.message} requestId={flow.formError?.requestId} />

      <View style={styles.footer}>
        <Button title={flow.isLast ? TEXTS.finish : TEXTS.next} onPress={next} loading={flow.isSaving} />
        <View style={styles.row}>
          {flow.stepIndex > 0 ? <Button title={TEXTS.back} variant='secondary' disabled={flow.isSaving} onPress={back} /> : null}
          <Button title={TEXTS.skip} variant='secondary' disabled={flow.isSaving} onPress={skip} />
        </View>
        <Button title={TEXTS.later} variant='secondary' disabled={flow.isSaving} onPress={later} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  progress: { gap: 6 },
  progressText: { fontSize: 13, color: '#555' },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#dcdcdc' },
  barDone: { backgroundColor: '#1f4fd1' },
  title: { fontSize: 24, fontWeight: '600' },
  stepBody: { gap: 16 },
  center: { alignItems: 'center', gap: 12 },
  hint: { fontSize: 14, color: '#555' },
  counter: { fontSize: 13, fontWeight: '600', color: '#1f4fd1' },
  error: { color: '#b42318', fontSize: 13 },
  footer: { gap: 12, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12 }
})
