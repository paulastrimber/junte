// Avisos push (S5-BE-07/08): nuevo inscripto (al creador), cupo liberado (a todos los que pidieron aviso), recordatorio
// (job) y mensaje nuevo de chat (a todos los del chat menos el remitente). Regla 10: se llaman DESPUÉS del commit y
// nunca bloquean ni rompen la operación de negocio: `planJoined`, `spotFreed` y `messageSent` devuelven una promesa que
// nunca rechaza y quien los llama no la espera. Los tokens que FCM informa como inválidos se borran. No importa Express
// ni Mongoose: todo llega por parámetro (DI).
import { NOTIFICATION_TEXTS, NOTIFICATION_TYPES, REMINDER_LEAD_MS } from './notification.rules.js'

// Tope de planes por pasada del job: lo que quede se procesa en el ciclo siguiente.
const BATCH_SIZE = 100

/**
 * @param {object} deps
 * @param {import('../../adapters/push/index.js').Push} deps.push
 * @param {{ findByUserIds: (ids: string[]) => Promise<Array<{ token: string }>>, removeTokens: (tokens: string[]) => Promise<number> }} deps.deviceTokenRepo
 * @param {{ findById: Function, findIdsDueForReminder: Function, markReminderSent: Function }} deps.planRepo
 * @param {{ findActiveUserIds: (planId: string) => Promise<string[]> }} deps.participationRepo
 * @param {{ findUserIdsByPlan: (planId: string) => Promise<string[]> }} deps.spotAlertRepo
 * @param {{ findById: (id: string) => Promise<{ name?: string } | null> }} deps.userRepo
 * @param {(plan: object) => boolean} deps.isFull  Regla del módulo `plans`.
 * @param {import('../../adapters/clock.js').Clock} deps.clock
 * @param {{ info: Function, warn: Function, error: Function }} deps.logger
 */
export function createNotifier ({ push, deviceTokenRepo, planRepo, participationRepo, spotAlertRepo, userRepo, isFull, clock, logger }) {
  /** Envía a todos los dispositivos de esos usuarios y borra los tokens inválidos. Nunca loguea tokens. */
  async function sendToUsers ({ type, plan, userIds, texts }) {
    const devices = await deviceTokenRepo.findByUserIds(userIds)
    const base = { event: 'push.sent', type, planId: plan.id, recipients: userIds.length, devices: devices.length }
    if (devices.length === 0) {
      logger.info(base, 'push skipped: no devices')
      return
    }
    const result = await push.send({
      tokens: devices.map((device) => device.token),
      notification: texts,
      data: { type, planId: plan.id }
    })
    const removedTokens = result.invalidTokens.length > 0 ? await deviceTokenRepo.removeTokens(result.invalidTokens) : 0
    logger.info({ ...base, sent: result.sent, failed: result.failed, removedTokens }, 'push sent')
  }

  /** Corre el aviso sin dejar escapar errores: un fallo de push se loguea y no rompe nada. */
  function safely (type, planId, work) {
    return Promise.resolve()
      .then(work)
      .catch((err) => logger.error({ err, type, planId }, 'push notification failed'))
  }

  const isUpcomingOpen = (plan) => plan.status === 'open' && plan.startsAt.getTime() > clock.now().getTime()

  return {
    /**
     * Nuevo inscripto: avisa al creador (salvo que el que se inscribió sea él).
     * @param {{ planId: string, userId: string }} params
     * @returns {Promise<void>} nunca rechaza.
     */
    planJoined ({ planId, userId }) {
      const type = NOTIFICATION_TYPES.PLAN_JOINED
      return safely(type, planId, async () => {
        const plan = await planRepo.findById(planId)
        if (!plan || plan.creatorId === userId) return
        const joiner = await userRepo.findById(userId)
        const texts = NOTIFICATION_TEXTS[type]({ plan, name: joiner?.name })
        await sendToUsers({ type, plan, userIds: [plan.creatorId], texts })
      })
    },

    /**
     * Mensaje nuevo en el chat: avisa a TODOS los del chat (participantes activos + creador) menos el remitente. Una
     * push por mensaje; el aviso nunca lleva el texto (regla 13 / doc 08), solo quién escribió y en qué plan.
     * @param {{ planId: string, senderId: string, senderName?: string }} params  `senderId` sale del token.
     * @returns {Promise<void>} nunca rechaza.
     */
    messageSent ({ planId, senderId, senderName }) {
      const type = NOTIFICATION_TYPES.MESSAGE
      return safely(type, planId, async () => {
        const plan = await planRepo.findById(planId)
        if (!plan) return
        const active = await participationRepo.findActiveUserIds(planId)
        const userIds = [...new Set([plan.creatorId, ...active])].filter((id) => id !== senderId)
        if (userIds.length === 0) return
        await sendToUsers({ type, plan, userIds, texts: NOTIFICATION_TEXTS[type]({ plan, name: senderName }) })
      })
    },

    /**
     * Cupo liberado: avisa a TODOS los que pidieron aviso en ese plan (sin orden: el primero que se inscribe se queda
     * con el lugar). Si el plan ya no admite inscripciones o se volvió a llenar, no avisa. Los pedidos se conservan.
     * @param {{ planId: string }} params
     * @returns {Promise<void>} nunca rechaza.
     */
    spotFreed ({ planId }) {
      const type = NOTIFICATION_TYPES.SPOT_FREED
      return safely(type, planId, async () => {
        const plan = await planRepo.findById(planId)
        if (!plan || !isUpcomingOpen(plan) || isFull(plan)) return
        const [requested, joined] = await Promise.all([spotAlertRepo.findUserIdsByPlan(planId), participationRepo.findActiveUserIds(planId)])
        const already = new Set(joined)
        const userIds = requested.filter((id) => !already.has(id))
        if (userIds.length === 0) return
        await sendToUsers({ type, plan, userIds, texts: NOTIFICATION_TEXTS[type]({ plan }) })
      })
    },

    /**
     * Job: recordatorio a los inscriptos de los planes que empiezan dentro de la próxima hora. Cada plan se reserva con
     * una actualización condicional (`reminderSentAt`) ANTES de enviar: el recordatorio sale una sola vez aunque el job
     * se repita o corran dos instancias. Si el envío falla no se reintenta (a lo sumo una vez).
     * @returns {Promise<number>} planes recordados.
     */
    async sendDueReminders () {
      const type = NOTIFICATION_TYPES.REMINDER
      const now = clock.now()
      const until = new Date(now.getTime() + REMINDER_LEAD_MS)
      const planIds = await planRepo.findIdsDueForReminder({ now, until, limit: BATCH_SIZE })
      let processed = 0
      for (const planId of planIds) {
        const plan = await planRepo.markReminderSent(planId, { now, until })
        if (!plan) continue
        processed += 1
        await safely(type, planId, async () => {
          const userIds = await participationRepo.findActiveUserIds(planId)
          if (userIds.length > 0) await sendToUsers({ type, plan, userIds, texts: NOTIFICATION_TEXTS[type]({ plan }) })
        })
      }
      return processed
    }
  }
}
