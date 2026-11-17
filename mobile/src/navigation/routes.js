// Nombres de las rutas. En un archivo aparte para que las pantallas puedan navegar sin importar el navegador
// (que a su vez importa las pantallas).
export const ROUTES = Object.freeze({
  LOGIN: 'Login',
  REGISTER: 'Register',
  // Recuperar la contraseña (desde el login): pedir el código y, con el código, elegir la nueva
  FORGOT_PASSWORD: 'ForgotPassword',
  RESET_PASSWORD: 'ResetPassword',
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
  // Chat del plan (solo creador y anotados), también desde el detalle de un plan
  CHAT: 'Chat',
  // Reportar un plan, un usuario o un mensaje (desde el detalle de un plan o el chat)
  REPORT: 'Report',
  // Lo que se hizo sin conexión y espera para enviarse (desde el aviso de conexión de cada pantalla)
  PENDING_ACTIONS: 'PendingActions',
  // Tab "Mis planes"
  MY_PLANS: 'MyPlans',
  // Tab "Crear"
  CREATE_PLAN: 'CreatePlan',
  // Tab "Perfil"
  PROFILE: 'Profile',
  CHANGE_PASSWORD: 'ChangePassword',
  HEALTH: 'Health'
})
