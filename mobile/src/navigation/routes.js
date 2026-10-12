// Nombres de las rutas. En un archivo aparte para que las pantallas puedan navegar sin importar el navegador
// (que a su vez importa las pantallas).
export const ROUTES = Object.freeze({
  LOGIN: 'Login',
  REGISTER: 'Register',
  ONBOARDING: 'Onboarding',
  // Tabs de la app
  FEED_TAB: 'FeedTab',
  CREATE_TAB: 'CreateTab',
  MY_PLANS_TAB: 'MyPlansTab',
  PROFILE_TAB: 'ProfileTab',
  // Tab "Planes"
  HOME: 'Home',
  PLAN: 'Plan',
  EDIT_PLAN: 'EditPlan',
  // Asistencia (desde el detalle de un plan, en los tabs "Planes" y "Mis planes")
  PLAN_QR: 'PlanQr',
  CHECK_IN: 'CheckIn',
  // Tab "Mis planes"
  MY_PLANS: 'MyPlans',
  // Tab "Crear"
  CREATE_PLAN: 'CreatePlan',
  // Tab "Perfil"
  PROFILE: 'Profile',
  HEALTH: 'Health'
})
