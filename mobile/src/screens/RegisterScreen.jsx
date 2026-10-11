import { StyleSheet, Text } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Screen } from '../components/Screen.jsx'
import { useRegisterForm } from '../hooks/useRegisterForm.js'

export const TEXTS = Object.freeze({
  title: 'Crear cuenta',
  name: 'Nombre',
  email: 'Email',
  password: 'Contraseña (mínimo 8 caracteres)',
  submit: 'Registrarme',
  login: 'Ya tengo cuenta'
})

export default function RegisterScreen ({ navigation }) {
  const { values, setValue, errors, formError, isSubmitting, submit } = useRegisterForm()

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole='header'>{TEXTS.title}</Text>
      <FormField
        label={TEXTS.name}
        value={values.name}
        onChangeText={(text) => setValue('name', text)}
        error={errors.name}
        autoComplete='name'
        textContentType='name'
        editable={!isSubmitting}
      />
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
        autoComplete='new-password'
        textContentType='newPassword'
        editable={!isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner message={formError?.message} requestId={formError?.requestId} />
      <Button title={TEXTS.submit} onPress={submit} loading={isSubmitting} />
      <Button title={TEXTS.login} variant='secondary' disabled={isSubmitting} onPress={() => navigation.navigate('Login')} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '600' }
})
