import { View } from 'react-native'

import { CATALOG_STATUS } from '../hooks/useCatalogs.js'
import { spacing } from '../theme/index.js'
import { Button } from './Button.jsx'
import { LoadingState } from './LoadingState.jsx'
import { Notice } from './Notice.jsx'

/**
 * Muestra el contenido cuando los catálogos están cargados; mientras tanto, cargando o el error con "Reintentar".
 * Es un bloque dentro de un formulario: el error no ocupa la pantalla.
 * @param {{ status: string, onRetry: () => void, children: import('react').ReactNode }} props
 */
export function CatalogGate ({ status, onRetry, children }) {
  if (status === CATALOG_STATUS.READY) return children
  if (status === CATALOG_STATUS.LOADING) return <LoadingState label='Cargando opciones…' />
  return (
    <View style={styles.box}>
      <Notice tone='danger' icon='cloud-offline-outline' message='No pudimos cargar las opciones.' accessibilityRole='alert'>
        <Button title='Reintentar' variant='secondary' size='sm' icon='refresh-outline' onPress={onRetry} style={styles.retry} />
      </Notice>
    </View>
  )
}

const styles = {
  box: { paddingVertical: spacing.sm },
  retry: { alignSelf: 'flex-start', marginTop: spacing.sm }
}
