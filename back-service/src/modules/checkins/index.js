// API pública del módulo `checkins`: lo único que otros módulos y el container importan.
export { CheckIn } from './checkin.model.js'
export { createCheckInRepository } from './checkin.repository.js'
export { createCheckInService } from './checkin.service.js'
export { createAttendanceService } from './attendance.service.js'
export { createCheckInController } from './checkin.controller.js'
export { createCheckInRoutes } from './checkin.routes.js'
