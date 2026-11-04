// API pública del módulo `spot-alerts` ("avisame si se libera un lugar"): lo único que otros módulos y el container importan.
export { SpotAlert } from './spot-alert.model.js'
export { createSpotAlertRepository } from './spot-alert.repository.js'
export { createSpotAlertService } from './spot-alert.service.js'
export { createSpotAlertController } from './spot-alert.controller.js'
export { createSpotAlertRoutes } from './spot-alert.routes.js'
