import { View } from 'react-native'

import { Button } from '../components/Button.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { Wordmark } from '../components/Wordmark.jsx'
import { useRegisterForm } from '../hooks/useRegisterForm.js'
import { spacing } from '../theme/index.js'

export const TEXTS = Object.freeze({
  title: 'Crear cuenta',
  subtitle: 'Sumate y encontrá planes cerca tuyo.',
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
      <View style={styles.intro}>
        <Wordmark size={32} />
        <View>
          <Text variant='title' accessibilityRole='header'>{TEXTS.title}</Text>
          <Text color='textMuted'>{TEXTS.subtitle}</Text>
        </View>
      </View>
      <FormField
        label={TEXTS.name}
        icon='person-outline'
        value={values.name}
        onChangeText={(text) => setValue('name', text)}
        error={errors.name}
        autoComplete='name'
        textContentType='name'
        returnKeyType='next'
        editable={!isSubmitting}
      />
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
        autoComplete='new-password'
        textContentType='newPassword'
        returnKeyType='go'
        editable={!isSubmitting}
        onSubmitEditing={submit}
      />
      <ErrorBanner message={formError?.message} requestId={formError?.requestId} />
      <View style={styles.actions}>
        <Button title={TEXTS.submit} onPress={submit} loading={isSubmitting} />
        <Button title={TEXTS.login} variant='ghost' disabled={isSubmitting} onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  )
}

const styles = {
  intro: { gap: spacing.lg, marginBottom: spacing.sm },
  actions: { gap: spacing.xs, marginTop: spacing.sm }
}
