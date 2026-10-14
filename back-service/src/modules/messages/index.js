// API pública del módulo `messages`: lo único que otros módulos y el container importan.
export { Message } from './message.model.js'
export { createMessageRepository } from './message.repository.js'
export { createMessageService } from './message.service.js'
export { createMessageSerializer } from './message.serializer.js'
export { createMessageController } from './message.controller.js'
export { createMessageRoutes } from './message.routes.js'
export { chatRoomPayload, chatSendPayload } from './message.validators.js'
