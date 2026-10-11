// Forma de las claves de S3 de las fotos de perfil: users/<userId>/<uuid>.<jpg|png|webp>.
import { ALLOWED_IMAGE_TYPES } from '../../shared/uploads.js'

const EXTENSIONS = Object.values(ALLOWED_IMAGE_TYPES).join('|')

/** Forma general (cualquier dueño): la validación de forma de la request. El dueño lo decide el servicio. */
export const USER_OBJECT_KEY = new RegExp(`^users/[0-9a-f]{24}/[A-Za-z0-9-]{1,64}\\.(${EXTENSIONS})$`)

/** Parte de la clave después de `users/<userId>/`: un nombre simple, sin barras ni `..`. */
export const OBJECT_NAME = new RegExp(`^[A-Za-z0-9-]{1,64}\\.(${EXTENSIONS})$`)
