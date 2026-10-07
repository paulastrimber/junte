import express from 'express';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use(healthRouter);
  // Las rutas de negocio se montan bajo /api/v1.

  return app;
}
