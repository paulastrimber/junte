// API pública del módulo `reports`: lo único que otros módulos y el container importan.
export { Report, REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from './report.model.js'
export { createReportRepository } from './report.repository.js'
export { createReportService } from './report.service.js'
export { createReportController } from './report.controller.js'
export { createReportRoutes } from './report.routes.js'
