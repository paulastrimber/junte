// Router de Express con enrutado estricto: `/auth/LOGIN` y `/auth/login/` NO son `/auth/login`.
// Así el límite estricto de Nginx sobre login/register no se esquiva con una variante de la URL
// (Nginx cubre las mismas variantes por su lado: esto es defensa en profundidad).
// Todos los routers de la app se crean con esta función.
import express from 'express'

export function createRouter () {
  return express.Router({ caseSensitive: true, strict: true })
}
