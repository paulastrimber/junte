import { StyleSheet, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { Wordmark } from '../components/Wordmark.jsx'
import { useForgotPasswordForm } from '../hooks/useForgotPasswordForm.js'
import { ROUTES } from '../navigation/routes.js'
import { spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Recuperar contraseña',
  subtitle: 'Decinos el email de tu cuenta y te mandamos un código para que elijas una contraseña nueva.',
  email: 'Email',
  submit: 'Enviar código',
  back: 'Volver a iniciar sesión'
})

/** "Olvidé mi contraseña", paso 1: pedir el código. Llega con `{ email }` si la persona ya lo había escrito en el login. */
export default function ForgotPasswordScreen ({ navigation, route }) {
  const { email, setEmail, error, formError, isSubmitting, submit } = useForgotPasswordForm({
    initialEmail: route?.params?.email ?? '',
    onSent: (address) => navigation.navigate(ROUTES.RESET_PASSWORD, { email: address })
  })

  return (
    <Screen>
      <View style={styles.intro}>
        <Wordmark size={32} />
        <View>
          <Text variant='title' accessibilityRole='header'>{TEXTS.title}</Text>
          <Text color='textMuted'>{TEXTS.subtitle}</Text>
        </View>
      </View>
      <FormField
        label={TEXTS.email}
        icon='mail-outline'
        value={email}
        onChangeText={setEmail}
        error={error}
        autoCapitalize='none'
        autoComplete='email'
        keyboardType='email-address'
        textContentType='emailAddress'
        returnKeyType='go'
        editable={!isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner error={formError} />
      <View style={styles.actions}>
        <Button title={TEXTS.submit} onPress={submit} loading={isSubmitting} />
        <Button title={TEXTS.back} variant='ghost' disabled={isSubmitting} onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  intro: { gap: spacing.lg, marginBottom: spacing.sm },
  actions: { gap: spacing.xs, marginTop: spacing.sm }
})
