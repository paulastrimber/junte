// API pública del módulo `users`: lo único que otros módulos y el container importan.
export { User } from './user.model.js'
export { createUserRepository } from './user.repository.js'
export { createUserService, isProfileComplete } from './user.service.js'
export { createUserSerializer } from './user.serializer.js'
export { createUserController } from './user.controller.js'
export { createUserRoutes } from './user.routes.js'
export { createUserValidators } from './user.validators.js'
