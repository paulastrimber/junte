// Composition root: el único lugar que conoce las implementaciones concretas (DI sin framework).
// Ver docs/arquitectura/03-back-service.md#inyección-de-dependencias-sin-framework.
import { systemClock } from './adapters/clock.js'
import { connectDb, disconnectDb, pingDb, withTransaction } from './adapters/db/index.js'
import { createLogger } from './adapters/logger.js'
import { createArgon2Hasher } from './adapters/passwordHasher.js'
import { connectRedis, disconnectRedis, pingRedis } from './adapters/redis.js'
import { createRedisLock } from './adapters/redisLock.js'
import { createRedisSocketAdapter } from './adapters/socketAdapter.js'
import { createMemoryPush, createPushFromConfig } from './adapters/push/index.js'
import { createMemoryStorage, createS3Storage } from './adapters/storage/index.js'
import { createScheduler } from './jobs/scheduler.js'
import { createAuthenticate } from './middlewares/authenticate.js'
import { createAdminController, createAdminRoutes, createAdminService } from './modules/admin/index.js'
import {
  Career, City, Interest, InterestCategory, Neighborhood, University,
  createCatalogAdminService, createCatalogController, createCatalogRepository, createCatalogRoutes, createCatalogService
} from './modules/catalogs/index.js'
import {
  Session, createAuthController, createAuthRoutes, createAuthService, createSessionRepository, createTokenService
} from './modules/auth/index.js'
import {
  CheckIn, createAttendanceService, createCheckInController, createCheckInRepository, createCheckInRoutes, createCheckInService
} from './modules/checkins/index.js'
import { DeviceToken, createDeviceController, createDeviceRoutes, createDeviceService, createDeviceTokenRepository } from './modules/devices/index.js'
import { createNotifier } from './modules/notifications/index.js'
import { buildScorers, createFeedController, createFeedRoutes, createFeedService } from './modules/feed/index.js'
import {
  Message, createMessageController, createMessageRepository, createMessageRoutes, createMessageSerializer, createMessageService
} from './modules/messages/index.js'
import {
  Participation, createParticipationController, createParticipationRepository, createParticipationRoutes, createParticipationService
} from './modules/participations/index.js'
import {
  Plan, createMyPlansRoutes, createPlanController, createPlanRepository, createPlanRoutes, createPlanSerializer, createPlanService,
  isFull, isLive, matchesQrChallenge, pickFilters, planIdParams
} from './modules/plans/index.js'
import {
  Report, createReportController, createReportRepository, createReportRoutes, createReportService
} from './modules/reports/index.js'
import {
  SpotAlert, createSpotAlertController, createSpotAlertRepository, createSpotAlertRoutes, createSpotAlertService
} from './modules/spot-alerts/index.js'
import { createUploadController, createUploadRoutes, createUploadService } from './modules/uploads/index.js'
import { createChatBroadcaster } from './sockets/chat.broadcaster.js'
import { createSocketServer } from './sockets/index.js'
import {
  User, createUserController, createUserRepository, createUserRoutes, createUserSerializer, createUserService, createUserValidators,
  isProfileComplete
} from './modules/users/index.js'

/**
 * Cablea los módulos de dominio (repos → servicios → controladores → routers). No abre conexiones:
 * los tests lo usan con un reloj fijo, un hasher rápido y el storage en memoria.
 * @param {object} deps
 * @param {{ jwt: { secret: string }, feed: { weights: { interests: number, distance: number, schedule: number } } }} deps.config
 * @param {import('pino').Logger} deps.logger
 * @param {import('./adapters/clock.js').Clock} deps.clock
 * @param {import('./adapters/passwordHasher.js').PasswordHasher} deps.passwordHasher
 * @param {import('./adapters/storage/index.js').Storage} deps.storage
 * @param {import('./adapters/push/index.js').Push} [deps.push]  Avisos push (FCM); por defecto, en memoria (no envía nada).
 * @param {number} [deps.maxActiveSessions]
 */
export function buildModules ({ config, logger, clock, passwordHasher, storage, push = createMemoryPush(), maxActiveSessions }) {
  const userRepo = createUserRepository(User)
  const sessionRepo = createSessionRepository(Session)
  const tokens = createTokenService({ secret: config.jwt.secret, clock })

  const authService = createAuthService({ userRepo, sessionRepo, passwordHasher, tokens, clock, maxActiveSessions })
  const catalogRepo = createCatalogRepository({ InterestCategory, Interest, University, Career, City, Neighborhood })
  const catalogService = createCatalogService({ catalogRepo, clock })
  const planRepo = createPlanRepository(Plan)
  const participationRepo = createParticipationRepository(Participation)
  const checkInRepo = createCheckInRepository(CheckIn)
  const messageRepo = createMessageRepository(Message)
  const reportRepo = createReportRepository(Report)
  const spotAlertRepo = createSpotAlertRepository(SpotAlert)
  const deviceTokenRepo = createDeviceTokenRepository(DeviceToken)

  const userService = createUserService({
    userRepo, storage, catalogs: catalogService, clock, logger, countNoShows: participationRepo.countNoShows
  })
  const userSerializer = createUserSerializer({ storage, clock })
  const messageSerializer = createMessageSerializer({ serializeSender: userSerializer.serializePublic, storage })
  // Tiempo real del chat: se conecta al servidor Socket.io cuando arranca (attachSockets); antes no emite nada.
  const chatBroadcaster = createChatBroadcaster({ serializeMessage: messageSerializer.serialize, logger })

  const planService = createPlanService({
    planRepo,
    userRepo,
    participationRepo,
    checkInRepo,
    catalogs: catalogService,
    isProfileComplete,
    storage,
    clock,
    logger,
    spotAlerts: { isRequested: spotAlertRepo.exists }
  })
  // Avisos push: siempre después del commit y sin bloquear la respuesta (regla 10).
  const notifier = createNotifier({ push, deviceTokenRepo, planRepo, participationRepo, spotAlertRepo, userRepo, isFull, clock, logger })
  const spotAlertService = createSpotAlertService({ plans: planService, planRepo, participationRepo, spotAlertRepo, isFull, clock, logger })
  const participationService = createParticipationService({
    plans: planService,
    planRepo,
    participationRepo,
    checkInRepo,
    userRepo,
    withTransaction,
    clock,
    logger,
    chatAccess: chatBroadcaster,
    spotAlerts: spotAlertRepo,
    notifier
  })
  const checkInService = createCheckInService({
    plans: planService, isLive, matchesQrChallenge, participationRepo, checkInRepo, userRepo, withTransaction, clock, logger
  })
  const attendanceService = createAttendanceService({ planRepo, participationRepo, checkInRepo, userRepo, withTransaction, clock, logger })
  const planSerializer = createPlanSerializer({ storage, serializeCreator: userSerializer.serializePublic })
  // Los pesos del score vienen de la configuración (FEED_WEIGHTS): cambiarlos no toca código ni contrato.
  const feedService = createFeedService({
    planRepo, userRepo, participationRepo, attachCreators: planService.attachCreators, scorers: buildScorers(config.feed.weights), clock
  })
  const messageService = createMessageService({
    plans: planService, participationRepo, messageRepo, userRepo, broadcaster: chatBroadcaster, clock, logger, storage, notifier
  })
  // Fotos (perfil y plan) y notas de voz del chat (solo para quien es parte del chat).
  const uploadService = createUploadService({ storage, plans: planService, messages: messageService })
  const reportService = createReportService({ reportRepo, userRepo, plans: planService, messages: messageService, clock, logger })
  const catalogAdmin = createCatalogAdminService({ catalogRepo, catalogService })
  const adminService = createAdminService({
    userRepo,
    reportRepo,
    messageRepo,
    planRepo,
    participationRepo,
    checkInRepo,
    authService,
    catalogAdmin,
    // `chat:hidden` y el corte de conexiones de un usuario suspendido.
    realtime: chatBroadcaster,
    clock,
    logger
  })

  const authenticate = createAuthenticate({ authService })

  const authController = createAuthController({ authService, serializeUser: userSerializer.serializeOwner })
  const userController = createUserController({ userService, userSerializer })
  const uploadController = createUploadController({ uploadService })
  const catalogController = createCatalogController({ catalogService })
  const planController = createPlanController({ planService, planSerializer, feedService })
  const feedController = createFeedController({ feedService, planSerializer, pickFilters })
  const spotAlertController = createSpotAlertController({ spotAlertService })
  const deviceService = createDeviceService({ deviceTokenRepo, clock, logger })
  const deviceController = createDeviceController({ deviceService })
  const participationController = createParticipationController({ participationService, serializeParticipant: userSerializer.serializePublic })
  const checkInController = createCheckInController({ checkInService })
  const messageController = createMessageController({ messageService, messageSerializer })
  const reportController = createReportController({ reportService })
  const adminController = createAdminController({ adminService })

  const routes = [
    { path: '/auth', router: createAuthRoutes({ authController, authenticate }) },
    { path: '/users', router: createUserRoutes({ userController, validators: createUserValidators({ clock }), authenticate }) },
    // "Mis planes" (GET /users/me/plans) es del módulo de planes.
    { path: '/users', router: createMyPlansRoutes({ planController, authenticate }) },
    { path: '/uploads', router: createUploadRoutes({ uploadController, authenticate }) },
    { path: '/catalogs', router: createCatalogRoutes({ catalogController, authenticate }) },
    { path: '/plans', router: createPlanRoutes({ planController, authenticate }) },
    // Inscripciones y check-in cuelgan de /plans/:id.
    { path: '/plans', router: createParticipationRoutes({ participationController, planIdParams, authenticate }) },
    { path: '/plans', router: createCheckInRoutes({ checkInController, planIdParams, authenticate }) },
    { path: '/plans', router: createSpotAlertRoutes({ spotAlertController, planIdParams, authenticate }) },
    { path: '/plans', router: createMessageRoutes({ messageController, planIdParams, authenticate }) },
    { path: '/feed', router: createFeedRoutes({ feedController, authenticate }) },
    // Tokens de push (FCM) del teléfono.
    { path: '/devices', router: createDeviceRoutes({ deviceController, authenticate }) },
    { path: '/reports', router: createReportRoutes({ reportController, authenticate }) },
    // Panel de administración: todo exige rol admin (router y servicio).
    { path: '/admin', router: createAdminRoutes({ adminController, authenticate }) }
  ]

  // Jobs periódicos: el scheduler los corre con lock (uno por ciclo entre todas las instancias).
  const jobs = [
    { name: 'close-attendance', run: attendanceService.closeDueAttendance },
    { name: 'complete-plans', run: attendanceService.completeDuePlans },
    // Recordatorio push a los inscriptos, una hora antes (una sola vez por plan: `reminderSentAt`).
    { name: 'send-reminders', run: notifier.sendDueReminders },
    // Pedidos de aviso de planes que ya empezaron o se cancelaron (se conservan hasta entonces).
    { name: 'purge-spot-alerts', run: spotAlertService.purgeExpired }
  ]

  return {
    routes,
    jobs,
    authenticate,
    authService,
    userService,
    uploadService,
    catalogService,
    planService,
    feedService,
    participationService,
    spotAlertService,
    notifier,
    push,
    checkInService,
    attendanceService,
    messageService,
    messageSerializer,
    reportService,
    adminService,
    chatBroadcaster,
    userSerializer,
    userRepo,
    sessionRepo
  }
}

/**
 * Arma las dependencias concretas a partir de la configuración validada.
 * Los módulos de dominio se agregan acá (repos → servicios → controladores → routers).
 * @param {Readonly<import('./config/env.js').AppConfig>} config
 */
export function createContainer (config) {
  const logger = createLogger({ level: config.logLevel })
  const clock = systemClock

  // Sin S3_BUCKET/AWS_REGION (solo posible fuera de producción, lo exige la config) se usa el storage
  // en memoria: las fotos no persisten ni se pueden subir desde la app. Ver docs/pendientes.md.
  const storage = config.storage
    ? createS3Storage({ ...config.storage, clock })
    : createMemoryStorage({ clock })
  if (!config.storage) logger.warn('S3_BUCKET/AWS_REGION not set: using in-memory storage (photos are not persisted)')

  // Sin FCM_SERVICE_ACCOUNT (todavía no hay proyecto de Firebase en todos los entornos) los avisos no salen: se usa un
  // push no-op sin estado (el de memoria acumularía lo "enviado" para siempre). Ver docs/pendientes.md.
  const push = createPushFromConfig({ config, logger })
  if (!config.push) logger.warn('FCM_SERVICE_ACCOUNT not set: push notifications are disabled (no-op push)')

  /** Routers de los módulos, montados bajo /internal por createApp. */
  const modules = buildModules({ config, logger, clock, passwordHasher: createArgon2Hasher(), storage, push })
  const { routes, jobs } = modules

  let redis = null
  let io = null
  let socketAdapter = null
  const scheduler = createScheduler({ jobs, lock: createRedisLock(() => redis), logger })

  return {
    config,
    logger,

    /** Dependencias que recibe createApp. */
    appDeps: {
      logger,
      health: { pingDb, pingRedis },
      routes
    },

    /** Abre las conexiones externas. Lanza si alguna falla (el proceso no debe arrancar). */
    async connect () {
      await connectDb(config.mongo.uri, { dbName: config.mongo.dbName })
      redis = await connectRedis(config.redis.url, { logger })
    },

    /** Jobs periódicos (cierre de asistencia y de planes). Se arranca después del `listen` y se frena al apagar. */
    scheduler,

    /**
     * Monta Socket.io (chat) sobre el servidor HTTP, con el adaptador de Redis para que un mensaje llegue a los
     * clientes conectados a cualquier instancia. Se llama después de `connect`.
     * @param {import('node:http').Server} httpServer
     */
    async attachSockets (httpServer) {
      socketAdapter = await createRedisSocketAdapter(redis, { logger })
      io = createSocketServer({
        httpServer,
        authService: modules.authService,
        messageService: modules.messageService,
        messageSerializer: modules.messageSerializer,
        broadcaster: modules.chatBroadcaster,
        logger,
        adapter: socketAdapter.adapter
      })
    },

    /** Corta las conexiones de Socket.io (los clientes reconectan contra otra instancia). Nunca lanza. */
    async closeSockets () {
      if (!io) return
      io.disconnectSockets(true)
      await new Promise((resolve) => io.close(() => resolve()))
      io = null
    },

    /** Cierra las conexiones. Nunca lanza: loguea lo que falle y sigue con el resto. */
    async disconnect () {
      if (socketAdapter) await socketAdapter.close()
      const results = await Promise.allSettled([disconnectRedis(), disconnectDb()])
      results
        .filter((result) => result.status === 'rejected')
        .forEach(({ reason }) => logger.error({ err: reason }, 'error closing connection'))
    }
  }
}
