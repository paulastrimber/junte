import { View } from 'react-native'

import { createThemedStyles, sizes, spacing } from '../theme/index.js'
import { Button } from './Button.jsx'
import { Icon } from './Icon.jsx'
import { Text } from './Text.jsx'

/**
 * Estado "vacío" o "no disponible" de una pantalla: un ícono, un mensaje y, opcionalmente, una acción.
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.icon]  Nombre de Ionicons.
 * @param {string} [props.actionTitle]
 * @param {() => void} [props.onAction]
 */
export function EmptyState ({ title, message, icon = 'compass-outline', actionTitle, onAction }) {
  const styles = useStyles()
  return (
    <View style={styles.box}>
      <View style={styles.orb}>
        <Icon name={icon} size={sizes.iconLg + 4} color='onPrimarySoft' />
      </View>
      <Text variant='heading' center>{title}</Text>
      {message ? <Text variant='body' color='textMuted' center>{message}</Text> : null}
      {actionTitle && onAction ? <Button title={actionTitle} variant='secondary' onPress={onAction} style={styles.action} /> : null}
    </View>
  )
}

const useStyles = createThemedStyles(({ colors }) => ({
  box: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  orb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: spacing.sm },
  action: { marginTop: spacing.md, alignSelf: 'stretch' }
}))
