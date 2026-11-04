// API pública del módulo `notifications` (avisos push): lo único que otros módulos y el container importan.
export { createNotifier } from './notification.service.js'
export { NOTIFICATION_TYPES, REMINDER_LEAD_MS } from './notification.rules.js'
