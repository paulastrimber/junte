// Entrada del panel /admin: login, navegación entre vistas y avisos. Ver docs/arquitectura/04-front-service.md#panel-admin.
import { hasSession, login, logout, onSessionEnd } from './api.js'
import { h, render } from './dom.js'
import { mountCatalogs } from './views/catalogs.js'
import { mountMetrics } from './views/metrics.js'
import { mountReports } from './views/reports.js'

const $ = (id) => document.getElementById(id)

const elements = {
  nav: $('nav'),
  session: $('session'),
  sessionEmail: $('session-email'),
  logout: $('logout'),
  banner: $('banner'),
  loginView: $('login-view'),
  loginForm: $('login-form'),
  appView: $('app-view')
}

let bannerTimer = null

/** Aviso arriba de la página. Los errores muestran el requestId para buscarlo en los logs. */
function notify (message, { ok = false, requestId = null } = {}) {
  clearTimeout(bannerTimer)
  elements.banner.className = ok ? 'banner ok' : 'banner'
  render(elements.banner, message, requestId && h('small', {}, `Código de seguimiento: ${requestId}`))
  elements.banner.hidden = false
  if (ok) bannerTimer = setTimeout(() => { elements.banner.hidden = true }, 4000)
}

const ui = { notify }

const VIEWS = {
  reports: (container) => mountReports(container, ui),
  metrics: (container) => mountMetrics(container),
  catalogs: (container) => mountCatalogs(container, ui)
}

async function show (view) {
  for (const tab of elements.nav.querySelectorAll('.tab')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page')
    else tab.removeAttribute('aria-current')
  }
  elements.banner.hidden = true
  render(elements.appView, h('p', { class: 'muted' }, 'Cargando…'))
  try {
    await VIEWS[view](elements.appView)
  } catch (error) {
    if (!hasSession()) return
    render(elements.appView, h('p', { class: 'empty' }, 'No pudimos cargar esta sección.'))
    notify(error.message, { requestId: error.requestId })
  }
}

function showLoggedIn (email) {
  elements.loginView.hidden = true
  elements.appView.hidden = false
  elements.nav.hidden = false
  elements.session.hidden = false
  elements.sessionEmail.textContent = email
}

function showLoggedOut () {
  elements.loginView.hidden = false
  elements.appView.hidden = true
  elements.nav.hidden = true
  elements.session.hidden = true
  elements.sessionEmail.textContent = ''
  render(elements.appView)
}

onSessionEnd((error) => {
  showLoggedOut()
  notify(error.code === 'ACCOUNT_SUSPENDED' ? 'Tu cuenta está suspendida.' : 'Tu sesión terminó. Volvé a ingresar.')
})

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = new FormData(elements.loginForm)
  const button = elements.loginForm.querySelector('button[type="submit"]')
  button.disabled = true
  try {
    const email = String(form.get('email')).trim()
    // `login` comprueba el rol: una cuenta sin permisos de administración no pasa de acá.
    await login(email, String(form.get('password')))
    elements.loginForm.reset()
    showLoggedIn(email)
    await show('reports')
  } catch (error) {
    notify(error.code === 'INVALID_CREDENTIALS' ? 'Email o contraseña incorrectos.' : error.message, { requestId: error.requestId })
  } finally {
    button.disabled = false
  }
})

elements.nav.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab')
  if (tab) show(tab.dataset.view)
})

elements.logout.addEventListener('click', async () => {
  await logout()
  showLoggedOut()
  notify('Cerraste la sesión.', { ok: true })
})
