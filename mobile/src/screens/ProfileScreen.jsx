import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../components/Avatar.jsx'
import { Button } from '../components/Button.jsx'
import { DateField } from '../components/DateField.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { InterestChips } from '../components/InterestChips.jsx'
import { Screen } from '../components/Screen.jsx'
import { useAuth } from '../hooks/useAuth.js'
import { useProfileForm } from '../hooks/useProfileForm.js'
import { useProfilePhoto } from '../hooks/useProfilePhoto.js'
import { useSessionActions } from '../hooks/useSessionActions.js'
import { MAX_INTERESTS } from '../utils/interests.js'

export const TEXTS = Object.freeze({
  incomplete: 'Completá tu nombre, fecha de nacimiento y al menos un interés para poder crear planes.',
  email: 'Email',
  age: 'Edad',
  name: 'Nombre',
  birthDate: 'Fecha de nacimiento',
  university: 'Universidad (opcional)',
  neighborhood: 'Barrio (opcional)',
  city: 'Localidad (opcional)',
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
  // Los manejadores se pasan como identificadores sueltos (regla react/jsx-handler-names).
  const { choosePhoto } = photo
  const { toggleInterest, submit: saveProfile } = form
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

      <FormField
        label={TEXTS.name}
        value={form.values.name}
        onChangeText={(text) => form.setValue('name', text)}
        error={form.errors.name}
        maxLength={form.maxLengths.name}
        editable={!form.isSaving}
      />
      <DateField
        label={TEXTS.birthDate}
        value={form.values.birthDate}
        onChange={(value) => form.setValue('birthDate', value)}
        error={form.errors.birthDate}
      />
      <FormField
        label={TEXTS.university}
        value={form.values.university}
        onChangeText={(text) => form.setValue('university', text)}
        error={form.errors.university}
        maxLength={form.maxLengths.university}
        editable={!form.isSaving}
      />
      <FormField
        label={TEXTS.neighborhood}
        value={form.values.neighborhood}
        onChangeText={(text) => form.setValue('neighborhood', text)}
        error={form.errors.neighborhood}
        maxLength={form.maxLengths.neighborhood}
        editable={!form.isSaving}
      />
      <FormField
        label={TEXTS.city}
        value={form.values.city}
        onChangeText={(text) => form.setValue('city', text)}
        error={form.errors.city}
        maxLength={form.maxLengths.city}
        editable={!form.isSaving}
      />

      <Text style={styles.sectionLabel}>{TEXTS.interests}</Text>
      <InterestChips selected={form.values.interests} onToggle={toggleInterest} />
      {form.errors.interests ? <Text style={styles.error}>{form.errors.interests}</Text> : null}

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
  readonly: { fontSize: 14, color: '#444' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#222' },
  error: { color: '#b42318', fontSize: 13 },
  saved: { color: '#1b7f3b' },
  footer: { gap: 12, marginTop: 16 }
})
