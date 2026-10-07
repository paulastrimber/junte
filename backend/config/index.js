// Carga configuración desde variables de entorno. Nunca guardar secretos en el repo.
export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
};
