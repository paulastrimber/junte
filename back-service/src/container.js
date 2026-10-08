// Composition root: el único lugar que conoce las implementaciones concretas (DI sin framework).
// Ver docs/arquitectura/03-back-service.md#inyección-de-dependencias-sin-framework.
import { connectDb, disconnectDb, pingDb } from './adapters/db/index.js'
import { createLogger } from './adapters/logger.js'
import { connectRedis, disconnectRedis, pingRedis } from './adapters/redis.js'

/**
 * Arma las dependencias concretas a partir de la configuración validada.
 * Los módulos de dominio se agregan acá (repos → servicios → controladores → routers).
 * @param {Readonly<import('./config/env.js').AppConfig>} config
 */
export function createContainer (config) {
  const logger = createLogger({ level: config.logLevel })

  /** Routers de los módulos, montados bajo /internal por createApp. */
  const routes = []

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
