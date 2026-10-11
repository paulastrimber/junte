// Zod con los mensajes por defecto en español (los `details` de VALIDATION_ERROR se muestran en la app).
// Todos los validators importan `z` desde acá para que la configuración se aplique siempre.
import { z } from 'zod'

z.config(z.locales.es())

export { z }
