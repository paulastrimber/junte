// API pública del módulo `participations`. En S3 solo el modelo y las lecturas; el servicio de altas y bajas es de S4.
export { Participation } from './participation.model.js'
export { createParticipationRepository } from './participation.repository.js'
