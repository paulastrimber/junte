// Títulos de las pantallas que se cargan recién al abrirlas (`getComponent` en RootNavigator). Viven acá y no solo en
// el `TEXTS` de cada pantalla: si el navegador los leyera de ahí, tendría que evaluar la pantalla (y el mapa, la
// cámara o el QR que importa) al arrancar. Cada pantalla los reutiliza en su `TEXTS`.
export const SCREEN_TITLES = Object.freeze({
  createPlan: 'Crear plan',
  editPlan: 'Editar plan',
  planQr: 'QR de asistencia',
  checkIn: 'Registrar asistencia',
  health: 'Estado del servidor'
})
