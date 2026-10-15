// Panel de administración (S6-BE-02 y 03): cola de reportes con vista previa de lo reportado, moderación de mensajes,
// suspensión de cuentas, métricas y edición de catálogos. `requireRole('admin')` es la primera barrera; cada operación
// vuelve a comprobar acá que quien la pide sea admin y esté activo (docs/arquitectura/09-seguridad.md).
// No importa Express ni Mongoose: todo llega por parámetro (DI).
import { errors } from '../../shared/errors.js'
import { cursorInstantField, decodeCursor, encodeCursor } from '../../shared/pagination.js'
import { objectIdField, z } from '../../shared/validation.js'

export const METRICS_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Clave de orden de la cola: `createdAt` (ms) + `_id`, más el estado (un cursor de otra pestaña es 400).
const reportsCursorSchema = z.strictObject({ s: z.string(), c: cursorInstantField, i: objectIdField })

const notAdmin = () => errors.forbidden('Solo una cuenta de administración puede hacer esto')
const invalidCursor = () => errors.validation([{ path: 'cursor', message: 'El cursor no es válido' }])

/**
 * @typedef {object} ReportItem
 * @property {import('../reports/report.repository.js').ReportEntity} report
 * @property {object | null} reporter
 * @property {object | null} resolver
 * @property {{ user?: object | null, plan?: object | null, creator?: object | null, message?: object | null, sender?: object | null }} target
 * @property {number} pendingForTarget  Reportes pendientes sobre lo mismo (de cualquier persona).
 */

/**
 * @param {object} deps
 * @param {ReturnType<import('../users/user.repository.js').createUserRepository>} deps.userRepo
 * @param {ReturnType<import('../reports/report.repository.js').createReportRepository>} deps.reportRepo
 * @param {ReturnType<import('../messages/message.repository.js').createMessageRepository>} deps.messageRepo
 * @param {ReturnType<import('../plans/plan.repository.js').createPlanRepository>} deps.planRepo
 * @param {{ countMetrics: (params: { since: Date }) => Promise<object> }} deps.participationRepo
 * @param {{ countMetrics: (params: { since: Date }) => Promise<object> }} deps.checkInRepo
 * @param {{ revokeAllSessions: (userId: string) => Promise<number> }} deps.authService
 * @param {ReturnType<import('../catalogs/catalog.admin.js').createCatalogAdminService>} deps.catalogAdmin
 * @param {{ publishHidden: (params: { planId: string, messageId: string }) => void, disconnectUser: (userId: string) => void }} deps.realtime
 *   Tiempo real (Socket.io); nunca lanza.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: (obj: object, msg: string) => void }} deps.logger
 */
export function createAdminService ({
  userRepo, reportRepo, messageRepo, planRepo, participationRepo, checkInRepo, authService, catalogAdmin, realtime, clock, logger
}) {
  /** @throws {import('../../shared/errors.js').AppError} FORBIDDEN */
  async function requireAdmin (adminId) {
    const admin = await userRepo.findById(adminId)
    if (!admin || admin.status !== 'active' || admin.role !== 'admin') throw notAdmin()
    return admin
  }

  const byId = (items) => new Map(items.map((item) => [item.id, item]))

  /**
   * Suma a cada reporte quién lo hizo, quién lo resolvió y una vista previa de lo reportado, con una consulta por
   * colección para toda la página (nunca una por reporte).
   * @param {import('../reports/report.repository.js').ReportEntity[]} reports
   * @returns {Promise<ReportItem[]>}
   */
  async function attachDetails (reports) {
    const idsOf = (type) => reports.filter((report) => report.targetType === type).map((report) => report.targetId)

    const messages = byId(await messageRepo.findByIds(idsOf('message')))
    const plans = byId(await planRepo.findByIds([...idsOf('plan'), ...[...messages.values()].map((message) => message.planId)]))
    const users = byId(await userRepo.findByIds([
      ...idsOf('user'),
      ...reports.map((report) => report.reporterId),
      ...reports.map((report) => report.resolvedBy).filter(Boolean),
      ...[...messages.values()].map((message) => message.senderId),
      ...[...plans.values()].map((plan) => plan.creatorId)
    ]))
    const pending = await reportRepo.countPendingByTargets(reports.map(({ targetType, targetId }) => ({ targetType, targetId })))

    const targetOf = ({ targetType, targetId }) => {
      if (targetType === 'user') return { user: users.get(targetId) ?? null }
      if (targetType === 'plan') {
        const plan = plans.get(targetId) ?? null
        return { plan, creator: plan ? users.get(plan.creatorId) ?? null : null }
      }
      const message = messages.get(targetId) ?? null
      return {
        message,
        plan: message ? plans.get(message.planId) ?? null : null,
        sender: message ? users.get(message.senderId) ?? null : null
      }
    }

    return reports.map((report) => ({
      report,
      reporter: users.get(report.reporterId) ?? null,
      resolver: report.resolvedBy ? users.get(report.resolvedBy) ?? null : null,
      target: targetOf(report),
      pendingForTarget: pending.get(`${report.targetType}:${report.targetId}`) ?? 0
    }))
  }

  return {
    requireAdmin,

    /**
     * Cola de moderación por estado. Pendientes del más viejo al más nuevo; resueltos, del más nuevo al más viejo.
     * @param {{ adminId: string, status: 'pending' | 'reviewed' | 'dismissed', limit: number, cursor?: string }} params
     * @returns {Promise<{ items: ReportItem[], nextCursor: string | null }>}
     * @throws {import('../../shared/errors.js').AppError} FORBIDDEN | VALIDATION_ERROR (cursor)
     */
    async listReports ({ adminId, status, limit, cursor }) {
      await requireAdmin(adminId)
      const decoded = cursor ? decodeCursor(cursor, reportsCursorSchema) : null
      if (decoded && decoded.s !== status) throw invalidCursor()
      const after = decoded ? { createdAt: new Date(decoded.c), id: decoded.i } : null

      // Uno de más para saber si hay otra página sin una segunda consulta.
      const found = await reportRepo.listByStatus({ status, order: status === 'pending' ? 'asc' : 'desc', after, limit: limit + 1 })
      const page = found.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = found.length > limit ? encodeCursor({ s: status, c: last.createdAt.getTime(), i: last.id }) : null
      return { items: await attachDetails(page), nextCursor }
    },

    /**
     * Resuelve un reporte. Si estaba pendiente, resuelve también los demás pendientes sobre lo mismo (la decisión es
     * sobre el contenido). Uno ya resuelto se puede corregir ("revisado" ↔ "descartado"), nunca volver a pendiente.
     * @param {{ adminId: string, reportId: string, status: 'reviewed' | 'dismissed' }} params
     * @returns {Promise<{ item: ReportItem, resolvedCount: number }>}
     * @throws {import('../../shared/errors.js').AppError} FORBIDDEN | NOT_FOUND
     */
    async resolveReport ({ adminId, reportId, status }) {
      await requireAdmin(adminId)
      const report = await reportRepo.findById(reportId)
      if (!report) throw errors.notFound('No encontramos ese reporte')

      const at = clock.now()
      let resolvedCount = 0
      if (report.status === 'pending') {
        const { targetType, targetId } = report
        resolvedCount = await reportRepo.resolvePendingForTarget({ targetType, targetId, status, resolvedBy: adminId, at })
      } else if (report.status !== status) {
        resolvedCount = (await reportRepo.changeResolution(reportId, { status, resolvedBy: adminId, at })) ? 1 : 0
      }
      if (resolvedCount > 0) {
        logger.info({ event: 'report.resolved', adminId, reportId, targetType: report.targetType, status, resolvedCount }, 'report resolved')
      }

      const [item] = await attachDetails([await reportRepo.findById(reportId)])
      return { item, resolvedCount }
    },

    /**
     * Oculta o vuelve a mostrar un mensaje del chat. Al ocultarlo se avisa a la sala del plan (`chat:hidden`), después
     * de guardar (regla 10); el historial ya no lo trae para los usuarios.
     * @param {{ adminId: string, messageId: string, status: 'visible' | 'hidden' }} params
     * @returns {Promise<{ message: import('../messages/message.repository.js').MessageEntity, sender: object | null }>}
     * @throws {import('../../shared/errors.js').AppError} FORBIDDEN | NOT_FOUND
     */
    async setMessageStatus ({ adminId, messageId, status }) {
      await requireAdmin(adminId)
      const result = await messageRepo.setStatus(messageId, status)
      if (!result) throw errors.notFound('No encontramos ese mensaje')

      const { message, changed } = result
      if (changed) {
        logger.info({ event: 'message.moderated', adminId, messageId, planId: message.planId, status }, 'message moderated')
        if (status === 'hidden') realtime.publishHidden({ planId: message.planId, messageId })
      }
      return { message, sender: await userRepo.findById(message.senderId) }
    },

    /**
     * Suspende o reactiva una cuenta. Suspender corta el acceso en el acto: `authenticate` ya rechaza al usuario en cada
     * request, y además se cierran todas sus sesiones (no puede renovar tokens) y sus conexiones del chat en todas las
     * instancias. Sus planes e inscripciones quedan como están (decidido en S6: es reversible).
     * Nadie se suspende a sí mismo, y a otro admin primero hay que quitarle el rol (script operativo).
     * @param {{ adminId: string, userId: string, status: 'active' | 'suspended' }} params
     * @returns {Promise<import('../users/user.repository.js').UserEntity>}
     * @throws {import('../../shared/errors.js').AppError} FORBIDDEN | NOT_FOUND
     */
    async setUserStatus ({ adminId, userId, status }) {
      await requireAdmin(adminId)
      if (userId === adminId) throw errors.forbidden('No podés cambiar el estado de tu propia cuenta')
      const target = await userRepo.findById(userId)
      if (!target) throw errors.notFound('No encontramos ese usuario')
      if (status === 'suspended' && target.role === 'admin') {
        throw errors.forbidden('No se puede suspender una cuenta de administración desde el panel: primero hay que quitarle el rol')
      }

      const updated = await userRepo.setStatus(userId, status)
      if (!updated) throw errors.notFound('No encontramos ese usuario')
      if (status === 'suspended') {
        // Después de guardar (regla 10). Idempotente: suspender otra vez vuelve a cerrar lo que haya quedado abierto.
        const revokedSessions = await authService.revokeAllSessions(userId)
        realtime.disconnectUser(userId)
        logger.info({ event: 'user.suspended', adminId, userId, revokedSessions }, 'user suspended')
      } else if (target.status !== status) {
        logger.info({ event: 'user.reactivated', adminId, userId }, 'user reactivated')
      }
      return updated
    },

    /**
     * Totales y actividad de los últimos 7 días.
     * @param {{ adminId: string }} params
     */
    async getMetrics ({ adminId }) {
      await requireAdmin(adminId)
      const now = clock.now()
      const since = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS)
      const [users, plans, participations, checkIns, messages, reports] = await Promise.all([
        userRepo.countMetrics({ since }),
        planRepo.countMetrics({ since }),
        participationRepo.countMetrics({ since }),
        checkInRepo.countMetrics({ since }),
        messageRepo.countMetrics({ since }),
        reportRepo.countMetrics({ since })
      ])
      return { generatedAt: now, windowDays: METRICS_WINDOW_DAYS, since, users, plans, participations, checkIns, messages, reports }
    },

    /** @param {{ adminId: string, catalog: string }} params */
    async listCatalog ({ adminId, catalog }) {
      await requireAdmin(adminId)
      return catalogAdmin.list(catalog)
    },

    /** @param {{ adminId: string, catalog: string, data: object }} params */
    async createCatalogRow ({ adminId, catalog, data }) {
      await requireAdmin(adminId)
      const row = await catalogAdmin.create(catalog, data)
      logger.info({ event: 'catalog.created', adminId, catalog, rowId: row.id }, 'catalog row created')
      return row
    },

    /** @param {{ adminId: string, catalog: string, id: string, changes: object }} params */
    async updateCatalogRow ({ adminId, catalog, id, changes }) {
      await requireAdmin(adminId)
      const row = await catalogAdmin.update(catalog, id, changes)
      logger.info({ event: 'catalog.updated', adminId, catalog, rowId: row.id, fields: Object.keys(changes) }, 'catalog row updated')
      return row
    }
  }
}
