import { StyleSheet, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { Wordmark } from '../components/Wordmark.jsx'
import { useLoginForm } from '../hooks/useLoginForm.js'
import { ROUTES } from '../navigation/routes.js'
import { spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Iniciar sesión',
  subtitle: 'Planes con gente de tu facultad.',
  email: 'Email',
  password: 'Contraseña',
  submit: 'Entrar',
  register: 'Crear una cuenta',
  forgot: '¿Olvidaste tu contraseña?',
  passwordReset: 'Listo: tu contraseña se cambió. Entrá con la nueva.'
})

/** Al volver de recuperar la contraseña llega con `{ email, passwordResetAt }`: carga el email y avisa que ya puede entrar. */
export default function LoginScreen ({ navigation, route }) {
  const { email: prefillEmail, passwordResetAt = null } = route?.params ?? {}
  const { values, setValue, errors, formError, notice, isSubmitting, submit } = useLoginForm({ prefillEmail, prefillKey: passwordResetAt })

  return (
    <Screen safeTop>
      <View style={styles.intro}>
        <Wordmark />
        <View>
          <Text variant='title' accessibilityRole='header'>{TEXTS.title}</Text>
          <Text color='textMuted'>{TEXTS.subtitle}</Text>
        </View>
      </View>
      {/* La sesión terminó sola (venció, cuenta suspendida): es un aviso, no una falla de lo que hizo la persona. */}
      {notice ? <Notice tone='warning' icon='time-outline' message={notice.message} accessibilityLiveRegion='polite' /> : null}
      {passwordResetAt ? <Notice tone='success' message={TEXTS.passwordReset} accessibilityLiveRegion='polite' /> : null}
      <FormField
        label={TEXTS.email}
        icon='mail-outline'
        value={values.email}
        onChangeText={(text) => setValue('email', text)}
        error={errors.email}
        autoCapitalize='none'
        autoComplete='email'
        keyboardType='email-address'
        textContentType='emailAddress'
        returnKeyType='next'
        editable={!isSubmitting}
      />
      <FormField
        label={TEXTS.password}
        icon='lock-closed-outline'
        value={values.password}
        onChangeText={(text) => setValue('password', text)}
        error={errors.password}
        secureTextEntry
        autoCapitalize='none'
        autoComplete='current-password'
        textContentType='password'
        returnKeyType='go'
        editable={!isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner error={formError} />
      <View style={styles.actions}>
        <Button title={TEXTS.submit} onPress={submit} loading={isSubmitting} />
        <Button
          title={TEXTS.forgot}
          variant='ghost'
          disabled={isSubmitting}
          // Lo que ya escribió viaja a la pantalla siguiente: no lo tiene que tipear de nuevo.
          onPress={() => navigation.navigate(ROUTES.FORGOT_PASSWORD, { email: values.email.trim() })}
        />
        <Button title={TEXTS.register} variant='ghost' disabled={isSubmitting} onPress={() => navigation.navigate(ROUTES.REGISTER)} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.sm },
  actions: { gap: spacing.xs, marginTop: spacing.sm }
})
