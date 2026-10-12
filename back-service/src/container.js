// Composition root: el único lugar que conoce las implementaciones concretas (DI sin framework).
// Ver docs/arquitectura/03-back-service.md#inyección-de-dependencias-sin-framework.
import { systemClock } from './adapters/clock.js'
import { connectDb, disconnectDb, pingDb } from './adapters/db/index.js'
import { createLogger } from './adapters/logger.js'
import { createArgon2Hasher } from './adapters/passwordHasher.js'
import { connectRedis, disconnectRedis, pingRedis } from './adapters/redis.js'
import { createMemoryStorage, createS3Storage } from './adapters/storage/index.js'
import { createAuthenticate } from './middlewares/authenticate.js'
import {
  Career, City, Interest, InterestCategory, Neighborhood, University,
  createCatalogController, createCatalogRepository, createCatalogRoutes, createCatalogService
} from './modules/catalogs/index.js'
import {
  Session, createAuthController, createAuthRoutes, createAuthService, createSessionRepository, createTokenService
} from './modules/auth/index.js'
import { buildScorers, createFeedController, createFeedRoutes, createFeedService } from './modules/feed/index.js'
import { Participation, createParticipationRepository } from './modules/participations/index.js'
import {
  Plan, createPlanController, createPlanRepository, createPlanRoutes, createPlanSerializer, createPlanService, pickFilters
} from './modules/plans/index.js'
import { createUploadController, createUploadRoutes, createUploadService } from './modules/uploads/index.js'
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
 * @param {number} [deps.maxActiveSessions]
 */
export function buildModules ({ config, logger, clock, passwordHasher, storage, maxActiveSessions }) {
  const userRepo = createUserRepository(User)
  const sessionRepo = createSessionRepository(Session)
  const tokens = createTokenService({ secret: config.jwt.secret, clock })

  const authService = createAuthService({ userRepo, sessionRepo, passwordHasher, tokens, clock, maxActiveSessions })
  const catalogRepo = createCatalogRepository({ InterestCategory, Interest, University, Career, City, Neighborhood })
  const catalogService = createCatalogService({ catalogRepo, clock })
  const userService = createUserService({ userRepo, storage, catalogs: catalogService, clock, logger })
  const userSerializer = createUserSerializer({ storage, clock })

  const planRepo = createPlanRepository(Plan)
  const participationRepo = createParticipationRepository(Participation)
  const planService = createPlanService({
    planRepo, userRepo, participationRepo, catalogs: catalogService, isProfileComplete, storage, clock, logger
  })
  const planSerializer = createPlanSerializer({ storage, serializeCreator: userSerializer.serializePublic })
  // Los pesos del score vienen de la configuración (FEED_WEIGHTS): cambiarlos no toca código ni contrato.
  const feedService = createFeedService({
    planRepo, userRepo, participationRepo, attachCreators: planService.attachCreators, scorers: buildScorers(config.feed.weights), clock
  })
  const uploadService = createUploadService({ storage, plans: planService })

  const authenticate = createAuthenticate({ authService })

  const authController = createAuthController({ authService, serializeUser: userSerializer.serializeOwner })
  const userController = createUserController({ userService, userSerializer })
  const uploadController = createUploadController({ uploadService })
  const catalogController = createCatalogController({ catalogService })
  const planController = createPlanController({ planService, planSerializer, feedService })
  const feedController = createFeedController({ feedService, planSerializer, pickFilters })

  const routes = [
    { path: '/auth', router: createAuthRoutes({ authController, authenticate }) },
    { path: '/users', router: createUserRoutes({ userController, validators: createUserValidators({ clock }), authenticate }) },
    { path: '/uploads', router: createUploadRoutes({ uploadController, authenticate }) },
    { path: '/catalogs', router: createCatalogRoutes({ catalogController, authenticate }) },
    { path: '/plans', router: createPlanRoutes({ planController, authenticate }) },
    { path: '/feed', router: createFeedRoutes({ feedController, authenticate }) }
  ]

  return {
    routes, authenticate, authService, userService, uploadService, catalogService, planService, feedService, userSerializer, userRepo, sessionRepo
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

  /** Routers de los módulos, montados bajo /internal por createApp. */
  const { routes } = buildModules({ config, logger, clock, passwordHasher: createArgon2Hasher(), storage })

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
      await connectRedis(config.redis.url, { logger })
    },

    /** Cierra las conexiones. Nunca lanza: loguea lo que falle y sigue con el resto. */
    async disconnect () {
      const results = await Promise.allSettled([disconnectRedis(), disconnectDb()])
      results
        .filter((result) => result.status === 'rejected')
        .forEach(({ reason }) => logger.error({ err: reason }, 'error closing connection'))
    }
  }
}
