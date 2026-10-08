// Carga configuración desde variables de entorno. Nunca guardar secretos en el repo.
// TODO(S1-BE-02): validar con Zod y no arrancar si falta algo.
export const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development'
}
