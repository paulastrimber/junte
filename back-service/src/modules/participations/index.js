// API pública del módulo `participations`: lo único que otros módulos y el container importan.
export { Participation } from './participation.model.js'
export { createParticipationRepository } from './participation.repository.js'
export { createParticipationService } from './participation.service.js'
export { createParticipationController } from './participation.controller.js'
export { createParticipationRoutes } from './participation.routes.js'
