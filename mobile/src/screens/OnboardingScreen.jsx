import { View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Badge } from '../components/Badge.jsx'
import { Button } from '../components/Button.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateField } from '../components/DateField.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FieldError } from '../components/FieldError.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { Screen } from '../components/Screen.jsx'
import { STUDY_TEXTS, StudyFields } from '../components/StudyFields.jsx'
import { Text } from '../components/Text.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useOnboarding } from '../hooks/useOnboarding.js'
import { useProfilePhoto } from '../hooks/useProfilePhoto.js'
import { createThemedStyles, radius, spacing } from '../theme/index.js'
import { MAX_INTERESTS, RECOMMENDED_INTERESTS } from '../utils/catalog.js'

export const TEXTS = Object.freeze({
  title: 'Bienvenido a junte',
  progress: (step, total) => `Paso ${step} de ${total}`,
  aboutHint: 'Todo es opcional: podés saltar este paso y completarlo después desde tu perfil.',
  birthDate: 'Fecha de nacimiento',
  photo: 'Elegir foto',
  changePhoto: 'Cambiar foto',
  uploadingPhoto: 'Subiendo foto…',
  // Universidad, carrera, ciudad y barrio: los mismos textos que en el perfil.
  ...STUDY_TEXTS,
  interestsHint: `Elegí hasta ${MAX_INTERESTS}. Con al menos ${RECOMMENDED_INTERESTS} te recomendamos mejores planes.`,
  interestsCount: (count) => `${count} de ${MAX_INTERESTS} elegidos`,
  back: 'Atrás',
  next: 'Siguiente',
  finish: 'Finalizar',
  skip: 'Saltar este paso',
  later: 'Más tarde'
})

function AboutStep ({ values, errors, setValue }) {
  const styles = useStyles()
  const { user } = useAuth()
  const photo = useProfilePhoto()
  const { choosePhoto } = photo
  return (
    <View style={styles.stepBody}>
      <Text color='textMuted'>{TEXTS.aboutHint}</Text>
      <View style={styles.center}>
        <Avatar photoUrl={user.photoUrl} name={user.name} />
        <Button
          title={photo.isUploading ? TEXTS.uploadingPhoto : (user.photoUrl ? TEXTS.changePhoto : TEXTS.photo)}
          variant='secondary'
          size='sm'
          icon='camera-outline'
          loading={photo.isUploading}
          onPress={choosePhoto}
        />
      </View>
      <ErrorBanner error={photo.error} />
      <DateField label={TEXTS.birthDate} value={values.birthDate} onChange={(value) => setValue('birthDate', value)} error={errors.birthDate} />
    </View>
  )
}

function InterestsStep ({ values, options, errors, toggleInterest }) {
  const styles = useStyles()
  return (
    <View style={styles.stepBody}>
      <Text color='textMuted'>{TEXTS.interestsHint}</Text>
      <View accessibilityLiveRegion='polite'>
        <Badge tone='primary' label={TEXTS.interestsCount(values.interests.length)} />
      </View>
      <InterestPicker categories={options.interestCategories} selected={values.interests} onToggle={toggleInterest} />
      <FieldError message={errors.interests} />
    </View>
  )
}

/** Onboarding de primer ingreso: 3 pasos, todos salteables, con "Más tarde" para salir en cualquier momento. */
export default function OnboardingScreen () {
  const styles = useStyles()
  const flow = useOnboarding()
  const { next, skip, back, later, retryCatalogs, setValue } = flow
  const progress = TEXTS.progress(flow.stepIndex + 1, flow.stepCount)

  // Las acciones quedan fijas abajo: "Siguiente" es lo único principal; volver, saltar o dejarlo para después, no.
  const footer = (
    <>
      <Button title={flow.isLast ? TEXTS.finish : TEXTS.next} onPress={next} loading={flow.isSaving} />
      <View style={styles.row}>
        {flow.stepIndex > 0 ? <Button title={TEXTS.back} variant='ghost' disabled={flow.isSaving} onPress={back} style={styles.flex} /> : null}
        <Button title={TEXTS.skip} variant='ghost' disabled={flow.isSaving} onPress={skip} style={styles.flex} />
      </View>
      <Button title={TEXTS.later} variant='ghost' size='sm' disabled={flow.isSaving} onPress={later} />
    </>
  )

  return (
    <Screen footer={footer}>
      <View accessible accessibilityRole='progressbar' accessibilityLabel={progress} accessibilityValue={{ min: 1, max: flow.stepCount, now: flow.stepIndex + 1 }} style={styles.progress}>
        <Text variant='caption' color='textMuted'>{progress}</Text>
        <View style={styles.bars}>
          {Array.from({ length: flow.stepCount }, (_, i) => (
            <View key={i} style={[styles.bar, i <= flow.stepIndex && styles.barDone]} />
          ))}
        </View>
      </View>
      <Text variant='title' accessibilityRole='header'>{flow.step.title}</Text>

      {flow.step.id === 'about' ? <AboutStep values={flow.values} errors={flow.errors} setValue={flow.setValue} /> : null}
      {flow.step.id === 'study'
        ? (
          <CatalogGate status={flow.catalogStatus} onRetry={retryCatalogs}>
            <StudyFields values={flow.values} options={flow.options} dependents={flow.dependents} errors={flow.errors} onChange={setValue} />
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

      <ErrorBanner error={flow.formError} />
    </Screen>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  progress: { gap: spacing.sm },
  bars: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  barDone: { backgroundColor: colors.primary },
  stepBody: { gap: spacing.lg },
  center: { alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm }
}))
