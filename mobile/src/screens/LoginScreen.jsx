import { StyleSheet, Text } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Screen } from '../components/Screen.jsx'
import { useLoginForm } from '../hooks/useLoginForm.js'

export const TEXTS = Object.freeze({
  title: 'Iniciar sesión',
  email: 'Email',
  password: 'Contraseña',
  submit: 'Entrar',
  register: 'Crear una cuenta'
})

export default function LoginScreen ({ navigation }) {
  const { values, setValue, errors, formError, notice, isSubmitting, submit } = useLoginForm()

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole='header'>{TEXTS.title}</Text>
      <ErrorBanner message={notice} />
      <FormField
        label={TEXTS.email}
        value={values.email}
        onChangeText={(text) => setValue('email', text)}
        error={errors.email}
        autoCapitalize='none'
        autoComplete='email'
        keyboardType='email-address'
        textContentType='emailAddress'
        editable={!isSubmitting}
      />
      <FormField
        label={TEXTS.password}
        value={values.password}
        onChangeText={(text) => setValue('password', text)}
        error={errors.password}
        secureTextEntry
        autoCapitalize='none'
        autoComplete='current-password'
        textContentType='password'
        editable={!isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner message={formError?.message} requestId={formError?.requestId} />
      <Button title={TEXTS.submit} onPress={submit} loading={isSubmitting} />
      <Button title={TEXTS.register} variant='secondary' disabled={isSubmitting} onPress={() => navigation.navigate('Register')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '600' }
})
