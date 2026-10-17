import { View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { DateField } from '../components/DateField.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FieldError } from '../components/FieldError.jsx'
import { FormField } from '../components/FormField.jsx'
import { Icon } from '../components/Icon.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { SectionHeader } from '../components/SectionHeader.jsx'
import { STUDY_TEXTS, StudyFields } from '../components/StudyFields.jsx'
import { Text } from '../components/Text.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useMyStats } from '../hooks/useMyStats.js'
import { useProfileForm } from '../hooks/useProfileForm.js'
import { useProfilePhoto } from '../hooks/useProfilePhoto.js'
import { useSessionActions } from '../hooks/useSessionActions.js'
import { ROUTES } from '../navigation/routes.js'
import { borders, createThemedStyles, sizes, spacing } from '../theme/index.js'
import { formatNoShows, formatReputation } from '../utils/attendance.js'
import { MAX_INTERESTS } from '../utils/catalog.js'

export const TEXTS = Object.freeze({
  title: 'Mi perfil',
  incomplete: 'Completá tu nombre, fecha de nacimiento y al menos un interés para poder crear planes.',
  email: 'Email',
  age: 'Edad',
  reputation: 'Reputación',
  noShows: 'Ausencias',
  reputationHint: 'Sumás 1 punto cada vez que registrás tu asistencia a un plan. Las ausencias solo las ves vos.',
  name: 'Nombre',
  birthDate: 'Fecha de nacimiento',
  ...STUDY_TEXTS,
  interests: `Intereses (hasta ${MAX_INTERESTS})`,
  changePhoto: 'Cambiar foto',
  uploadingPhoto: 'Subiendo foto…',
  save: 'Guardar cambios',
  saved: 'Cambios guardados.',
  health: 'Estado del servidor',
  signOut: 'Cerrar sesión',
  signOutAll: 'Cerrar sesión en todos mis dispositivos'
})

export default function ProfileScreen ({ navigation }) {
  const styles = useStyles()
  const { user } = useAuth()
  const form = useProfileForm()
  const photo = useProfilePhoto()
  const session = useSessionActions()
  const stats = useMyStats(user)
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { choosePhoto } = photo
  const { setValue, toggleInterest, submit: saveProfile, retryCatalogs } = form
  const { signOut, signOutAll } = session

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar photoUrl={user.photoUrl} name={user.name} />
        <Button
          title={photo.isUploading ? TEXTS.uploadingPhoto : TEXTS.changePhoto}
          variant='secondary'
          size='sm'
          icon='camera-outline'
          loading={photo.isUploading}
          onPress={choosePhoto}
        />
      </View>
      <ErrorBanner error={photo.error} />

      {/* Falta completar el perfil: es una invitación, no un error. */}
      {!user.profileComplete ? <Notice tone='info' icon='person-circle-outline' message={TEXTS.incomplete} /> : null}

      <Card variant='outlined'>
        <View style={styles.readonly}>
          <Icon name='mail-outline' size={sizes.iconSm} color='textMuted' />
          <Text variant='label' selectable style={styles.flex}>{TEXTS.email}: {user.email}</Text>
        </View>
        {user.age !== null
          ? (
            <View style={styles.readonly}>
              <Icon name='gift-outline' size={sizes.iconSm} color='textMuted' />
              <Text variant='label' style={styles.flex}>{TEXTS.age}: {user.age}</Text>
            </View>
            )
          : null}
      </Card>

      <Card variant='tinted'>
        <Text variant='bodyStrong' color='onPrimarySoft'>{TEXTS.reputation}: {formatReputation(stats.reputation)}</Text>
        {stats.noShowCount !== null ? <Text variant='label' color='onPrimarySoft'>{TEXTS.noShows}: {formatNoShows(stats.noShowCount)}</Text> : null}
        <Text variant='caption' color='onPrimarySoft'>{TEXTS.reputationHint}</Text>
      </Card>

      <FormField
        label={TEXTS.name}
        value={form.values.name}
        onChangeText={(text) => form.setValue('name', text)}
        error={form.errors.name}
        maxLength={form.maxNameLength}
        editable={!form.isSaving}
      />
      <DateField
        label={TEXTS.birthDate}
        value={form.values.birthDate}
        onChange={(value) => form.setValue('birthDate', value)}
        error={form.errors.birthDate}
      />
      <CatalogGate status={form.catalogStatus} onRetry={retryCatalogs}>
        <StudyFields values={form.values} options={form.options} dependents={form.dependents} errors={form.errors} onChange={setValue} />

        <View style={styles.section}>
          <SectionHeader title={TEXTS.interests} />
          <InterestPicker categories={form.options.interestCategories} selected={form.values.interests} onToggle={toggleInterest} />
          <FieldError message={form.errors.interests} />
        </View>
      </CatalogGate>

      <ErrorBanner error={form.formError} />
      {form.justSaved ? <Notice tone='success' message={TEXTS.saved} accessibilityLiveRegion='polite' /> : null}
      <Button title={TEXTS.save} onPress={saveProfile} loading={form.isSaving} disabled={!form.isDirty} />

      <View style={styles.footer}>
        <Button title={TEXTS.health} variant='ghost' icon='pulse-outline' onPress={() => navigation.navigate(ROUTES.HEALTH)} />
        <Button title={TEXTS.signOut} variant='ghost' icon='log-out-outline' disabled={session.isWorking} onPress={signOut} />
        <Button title={TEXTS.signOutAll} variant='danger' disabled={session.isWorking} onPress={signOutAll} />
        <ErrorBanner error={session.error} />
      </View>
    </Screen>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  header: { alignItems: 'center', gap: spacing.md },
  readonly: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  footer: { gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: borders.thin, borderTopColor: colors.border }
}))
