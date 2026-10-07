import { Router } from 'express';

// Comprobación del ALB en el puerto 3000. Sin token ni datos de negocio.
export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
