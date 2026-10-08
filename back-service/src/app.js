import express from 'express'

// TODO(S1-BE-01/03/04): middlewares, rutas bajo /internal y health real con pingDb/pingRedis.
export function createApp () {
  const app = express()
  app.use(express.json({ limit: '100kb' }))

  // Health mínimo mientras se implementa S1-BE-04.
  app.get(['/health', '/internal/health'], (req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  return app
}
