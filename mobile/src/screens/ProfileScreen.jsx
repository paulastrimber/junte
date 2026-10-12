import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { DateField } from '../components/DateField.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { CatalogGate } from '../components/CatalogGate.jsx'
import { InterestPicker } from '../components/InterestPicker.jsx'
import { Screen } from '../components/Screen.jsx'
import { SelectField } from '../components/SelectField.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useMyStats } from '../hooks/useMyStats.js'
import { useProfileForm } from '../hooks/useProfileForm.js'
import { useProfilePhoto } from '../hooks/useProfilePhoto.js'
import { useSessionActions } from '../hooks/useSessionActions.js'
import { formatNoShows, formatReputation } from '../utils/attendance.js'
import { MAX_INTERESTS } from '../utils/catalog.js'

export const TEXTS = Object.freeze({
  incomplete: 'Completá tu nombre, fecha de nacimiento y al menos un interés para poder crear planes.',
  email: 'Email',
  age: 'Edad',
  reputation: 'Reputación',
  noShows: 'Ausencias',
  reputationHint: 'Sumás 1 punto cada vez que registrás tu asistencia a un plan. Las ausencias solo las ves vos.',
  name: 'Nombre',
  birthDate: 'Fecha de nacimiento',
  university: 'Universidad',
  career: 'Carrera',
  city: 'Ciudad',
  neighborhood: 'Barrio',
  careerHint: 'Elegí primero una universidad con carreras.',
  neighborhoodHint: 'Elegí primero una ciudad con barrios.',
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
  const { user } = useAuth()
  const form = useProfileForm()
  const photo = useProfilePhoto()
  const session = useSessionActions()
  const stats = useMyStats(user)
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { choosePhoto } = photo
  const { toggleInterest, submit: saveProfile, retryCatalogs } = form
  const { signOut, signOutAll } = session

  return (
    <Screen>
      <View style={styles.header}>
        <Avatar photoUrl={user.photoUrl} name={user.name} />
        <Button
          title={photo.isUploading ? TEXTS.uploadingPhoto : TEXTS.changePhoto}
          variant='secondary'
          loading={photo.isUploading}
          onPress={choosePhoto}
        />
        <ErrorBanner message={photo.error} />
      </View>

      {!user.profileComplete ? <ErrorBanner message={TEXTS.incomplete} /> : null}

      <Text style={styles.readonly}>{TEXTS.email}: {user.email}</Text>
      {user.age !== null ? <Text style={styles.readonly}>{TEXTS.age}: {user.age}</Text> : null}

      <View style={styles.stats}>
        <Text style={styles.readonly}>{TEXTS.reputation}: {formatReputation(stats.reputation)}</Text>
        {stats.noShowCount !== null ? <Text style={styles.readonly}>{TEXTS.noShows}: {formatNoShows(stats.noShowCount)}</Text> : null}
        <Text style={styles.hint}>{TEXTS.reputationHint}</Text>
      </View>

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
        <View style={styles.group}>
          <SelectField label={TEXTS.university} value={form.values.university} options={form.options.universities} onChange={(key) => form.setValue('university', key)} error={form.errors.university} />
          <SelectField
            label={TEXTS.career}
            value={form.values.career}
            options={form.options.careers}
            allowOther={form.options.careers.length > 0}
            disabled={form.options.careers.length === 0}
            hint={form.options.careers.length === 0 ? TEXTS.careerHint : undefined}
            onChange={(key) => form.setValue('career', key)}
            error={form.errors.career}
          />
          <SelectField label={TEXTS.city} value={form.values.city} options={form.options.cities} onChange={(key) => form.setValue('city', key)} error={form.errors.city} />
          <SelectField
            label={TEXTS.neighborhood}
            value={form.values.neighborhood}
            options={form.options.neighborhoods}
            allowOther={form.options.neighborhoods.length > 0}
            disabled={form.options.neighborhoods.length === 0}
            hint={form.options.neighborhoods.length === 0 ? TEXTS.neighborhoodHint : undefined}
            onChange={(key) => form.setValue('neighborhood', key)}
            error={form.errors.neighborhood}
          />
        </View>

        <Text style={styles.sectionLabel}>{TEXTS.interests}</Text>
        <InterestPicker categories={form.options.interestCategories} selected={form.values.interests} onToggle={toggleInterest} />
        {form.errors.interests ? <Text style={styles.error}>{form.errors.interests}</Text> : null}
      </CatalogGate>

      <ErrorBanner message={form.formError?.message} requestId={form.formError?.requestId} />
      {form.justSaved ? <Text style={styles.saved} accessibilityLiveRegion='polite'>{TEXTS.saved}</Text> : null}
      <Button title={TEXTS.save} onPress={saveProfile} loading={form.isSaving} disabled={!form.isDirty} />

      <View style={styles.footer}>
        <Button title={TEXTS.health} variant='secondary' onPress={() => navigation.navigate('Health')} />
        <Button title={TEXTS.signOut} variant='secondary' disabled={session.isWorking} onPress={signOut} />
        <Button title={TEXTS.signOutAll} variant='danger' disabled={session.isWorking} onPress={signOutAll} />
        <ErrorBanner message={session.error} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 12 },
  group: { gap: 16 },
  readonly: { fontSize: 14, color: '#444' },
  stats: { gap: 4, padding: 12, borderRadius: 8, backgroundColor: '#f3f6ff' },
  hint: { fontSize: 12, color: '#666' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  error: { color: '#b42318', fontSize: 13 },
  saved: { color: '#1b7f3b' },
  footer: { gap: 12, marginTop: 16 }
})
