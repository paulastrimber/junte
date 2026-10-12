// Forma de las claves de S3 de las fotos de perfil: users/<userId>/<uuid>.<jpg|png|webp>.
import { objectKeyPattern } from '../../shared/uploads.js'

/** Forma general (cualquier dueño): la validación de forma de la request. El dueño lo decide el servicio. */
export const USER_OBJECT_KEY = objectKeyPattern('users')
