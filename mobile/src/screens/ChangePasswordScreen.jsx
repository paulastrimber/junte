import { StyleSheet, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { useChangePasswordForm } from '../hooks/useChangePasswordForm.js'
import { spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Cambiar contraseña',
  intro: 'Al cambiarla cerramos la sesión en tus otros dispositivos. En este seguís con la sesión iniciada.',
  current: 'Contraseña actual',
  next: 'Contraseña nueva (mínimo 8 caracteres)',
  submit: 'Cambiar contraseña',
  done: 'Listo: tu contraseña se cambió y cerramos la sesión en tus otros dispositivos.',
  forgot: 'Si no te acordás de la actual, cerrá sesión y tocá "¿Olvidaste tu contraseña?".',
  back: 'Volver al perfil'
})

/** Cambiar la contraseña con la sesión iniciada (desde el Perfil). */
export default function ChangePasswordScreen ({ navigation }) {
  const form = useChangePasswordForm()
  const { setValue, submit } = form

  if (form.isDone) {
    return (
      <Screen>
        <Notice tone='success' message={TEXTS.done} accessibilityLiveRegion='polite' />
        <Button title={TEXTS.back} variant='secondary' onPress={() => navigation.goBack()} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Text color='textMuted'>{TEXTS.intro}</Text>
      <FormField
        label={TEXTS.current}
        icon='lock-closed-outline'
        value={form.values.currentPassword}
        onChangeText={(text) => setValue('currentPassword', text)}
        error={form.errors.currentPassword}
        secureTextEntry
        autoCapitalize='none'
        autoComplete='current-password'
        textContentType='password'
        returnKeyType='next'
        editable={!form.isSubmitting}
      />
      <FormField
        label={TEXTS.next}
        icon='key-outline'
        value={form.values.newPassword}
        onChangeText={(text) => setValue('newPassword', text)}
        error={form.errors.newPassword}
        secureTextEntry
        autoCapitalize='none'
        autoComplete='new-password'
        textContentType='newPassword'
        returnKeyType='go'
        editable={!form.isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner error={form.formError} />
      <View style={styles.actions}>
        <Button title={TEXTS.submit} onPress={submit} loading={form.isSubmitting} />
        <Text variant='caption' color='textMuted'>{TEXTS.forgot}</Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm }
})
