// Scheduler de jobs periódicos (S4-BE-08). Corre dentro de cada instancia del back, pero cada job se ejecuta una
// sola vez por ciclo: antes de correr toma un lock (Redis en producción). Sin lock no corre nunca.
// No conoce Redis ni el dominio: recibe el lock, los jobs y el logger por parámetro.

export const DEFAULT_INTERVAL_MS = 60_000

/**
 * @typedef {object} Job
 * @property {string} name  También es la clave del lock.
 * @property {() => Promise<number>} run  Devuelve cuántos elementos procesó.
 */

/**
 * @param {object} deps
 * @param {Job[]} deps.jobs
 * @param {import('../adapters/redisLock.js').JobLock} deps.lock
 * @param {{ info: Function, warn: Function, error: Function }} deps.logger
 * @param {number} [deps.intervalMs]
 * @param {number} [deps.lockTtlMs]  Dura casi todo el ciclo: otra instancia no repite el job en el mismo ciclo, y si
 *   la que lo tomó se cae, el lock vence antes del ciclo siguiente.
 */
export function createScheduler ({ jobs, lock, logger, intervalMs = DEFAULT_INTERVAL_MS, lockTtlMs = Math.floor(intervalMs * 0.9) }) {
  let timer = null
  let running = null

  async function runJob (job) {
    let token
    try {
      token = await lock.acquire(job.name, lockTtlMs)
    } catch (err) {
      logger.warn({ job: job.name, reason: err.message }, 'job skipped: lock unavailable')
      return { ran: false }
    }
    if (!token) {
      logger.info({ job: job.name, lockAcquired: false }, 'job skipped: another instance has the lock')
      return { ran: false }
    }

    const startedAt = Date.now()
    logger.info({ job: job.name, lockAcquired: true }, 'job started')
    try {
      const processed = await job.run()
      logger.info({ job: job.name, processed, durationMs: Date.now() - startedAt }, 'job finished')
      return { ran: true, processed }
    } catch (err) {
      logger.error({ err, job: job.name }, 'job failed')
      return { ran: true, failed: true }
    }
    // El lock NO se libera al terminar: vence por TTL. Así un job rápido tampoco se repite en el mismo ciclo.
  }

  /** Un ciclo: todos los jobs, en orden. Si el ciclo anterior sigue corriendo, se saltea. */
  async function tick () {
    if (running) return running
    running = (async () => {
      const results = []
      for (const job of jobs) results.push({ name: job.name, ...await runJob(job) })
      return results
    })()
    try {
      return await running
    } finally {
      running = null
    }
  }

  return {
    tick,

    start () {
      if (timer) return
      timer = setInterval(() => { tick().catch((err) => logger.error({ err }, 'scheduler tick failed')) }, intervalMs)
      // No mantiene vivo el proceso por sí solo.
      timer.unref()
      logger.info({ jobs: jobs.map((job) => job.name), intervalMs }, 'scheduler started')
    },

    /** Deja de programar ciclos y espera al que esté en curso. */
    async stop () {
      if (timer) clearInterval(timer)
      timer = null
      await running?.catch(() => {})
    }
  }
}
