import { StyleSheet, View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { useResetPasswordForm } from '../hooks/useResetPasswordForm.js'
import { ROUTES } from '../navigation/routes.js'
import { spacing } from '../theme/index.js'
import { RESET_CODE_LENGTH } from '../utils/validation.js'

export const TEXTS = Object.freeze({
  title: 'Elegí una contraseña nueva',
  // No se afirma que la cuenta existe: el servidor no lo dice (así nadie puede averiguar qué emails están registrados).
  sent: (email) => `Si ${email} tiene una cuenta en junte, le mandamos un código de ${RESET_CODE_LENGTH} dígitos. Vence en 15 minutos.`,
  spam: 'Si no lo ves, revisá el correo no deseado.',
  code: 'Código',
  codeHint: `Los ${RESET_CODE_LENGTH} dígitos que te llegaron por email`,
  password: 'Contraseña nueva (mínimo 8 caracteres)',
  submit: 'Cambiar contraseña',
  resend: 'Mandarme otro código',
  resendIn: (seconds) => `Mandarme otro código (en ${seconds} s)`,
  resent: 'Te mandamos otro código. El anterior ya no sirve.'
})

/**
 * "Olvidé mi contraseña", paso 2: el código del email y la contraseña nueva. Llega con `{ email }`.
 * Cuando el servidor confirma el cambio vuelve al login, con el email cargado y un aviso.
 */
export default function ResetPasswordScreen ({ navigation, route }) {
  const { email } = route.params
  const form = useResetPasswordForm({
    email,
    onDone: () => navigation.popTo(ROUTES.LOGIN, { email, passwordResetAt: Date.now() })
  })
  const { setValue, submit, resend } = form

  return (
    <Screen>
      <Text variant='title' accessibilityRole='header'>{TEXTS.title}</Text>
      <Notice tone='info' icon='mail-outline' message={TEXTS.sent(email)}>
        <Text variant='caption' color='onPrimarySoft'>{TEXTS.spam}</Text>
      </Notice>
      <FormField
        label={TEXTS.code}
        icon='keypad-outline'
        hint={TEXTS.codeHint}
        value={form.values.code}
        onChangeText={(text) => setValue('code', text)}
        error={form.errors.code}
        keyboardType='number-pad'
        autoComplete='one-time-code'
        textContentType='oneTimeCode'
        maxLength={RESET_CODE_LENGTH}
        returnKeyType='next'
        editable={!form.isSubmitting}
      />
      <FormField
        label={TEXTS.password}
        icon='lock-closed-outline'
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
      {form.wasResent ? <Notice tone='success' message={TEXTS.resent} accessibilityLiveRegion='polite' /> : null}
      <View style={styles.actions}>
        <Button title={TEXTS.submit} onPress={submit} loading={form.isSubmitting} />
        <Button
          title={form.canResend ? TEXTS.resend : TEXTS.resendIn(form.secondsLeft)}
          variant='ghost'
          loading={form.isResending}
          disabled={!form.canResend || form.isSubmitting}
          onPress={resend}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  actions: { gap: spacing.xs, marginTop: spacing.sm }
})
