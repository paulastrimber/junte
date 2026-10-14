// Prueba de aceptación de S5-BE-05: con dos instancias del back (mismo Mongo y Redis), un mensaje enviado por
// Socket.io a la instancia A llega a un cliente conectado a la B. Lo corre `task chat:two-instances` contra
// docker-compose (perfil `scale`). Habla con cada back directo (puertos 3000 y 3001), sin pasar por Nginx.
// Crea dos usuarios y un plan de prueba en la base local (no se corre nunca contra AWS).
// Uso: node scripts/chat-two-instances.js http://localhost:3000 http://localhost:3001
import { randomBytes } from 'node:crypto'
import { io } from 'socket.io-client'

const [urlA = 'http://localhost:3000', urlB = 'http://localhost:3001'] = process.argv.slice(2)
const TIMEOUT_MS = 5000
const HOUR_MS = 60 * 60 * 1000

function fail (message) {
  throw new Error(message)
}

async function call (baseUrl, method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}/internal${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data = res.status === 204 ? null : await res.json()
  if (!res.ok) fail(`${method} ${path} → ${res.status} ${data?.code ?? ''}`)
  return data
}

/** Usuario de prueba con el perfil completo (puede crear planes). */
async function signUp (baseUrl, name) {
  const password = randomBytes(12).toString('hex')
  const email = `chat-${randomBytes(4).toString('hex')}@test.junte.invalid`
  const { accessToken } = await call(baseUrl, 'POST', '/auth/register', { body: { name, email, password } })
  await call(baseUrl, 'PUT', '/users/me', { token: accessToken, body: { birthDate: '2001-03-09', interests: ['futbol'] } })
  return accessToken
}

function connect (baseUrl, token) {
  const socket = io(baseUrl, { path: '/internal/socket.io', transports: ['websocket'], auth: { token }, reconnection: false })
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => reject(new Error(`${baseUrl}: ${err.data?.code ?? err.message}`)))
  })
}

async function main () {
  const creator = await signUp(urlA, 'Instancia A')
  const participant = await signUp(urlB, 'Instancia B')
  const startsAt = new Date(Date.now() + 48 * HOUR_MS)
  const plan = await call(urlA, 'POST', '/plans', {
    token: creator,
    body: {
      title: 'Prueba de chat entre instancias',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 2 * HOUR_MS).toISOString(),
      location: { label: 'Montevideo', type: 'Point', coordinates: [-56.16, -34.9] },
      capacity: 10,
      interests: ['futbol']
    }
  })
  await call(urlB, 'POST', `/plans/${plan.id}/join`, { token: participant })

  const socketA = await connect(urlA, creator)
  const socketB = await connect(urlB, participant)
  try {
    for (const socket of [socketA, socketB]) {
      const ack = await socket.timeout(TIMEOUT_MS).emitWithAck('chat:join', { planId: plan.id })
      if (!ack.ok) fail(`chat:join → ${ack.error?.code}`)
    }

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('el mensaje no llegó a la instancia B')), TIMEOUT_MS)
      socketB.once('chat:message', (message) => { clearTimeout(timer); resolve(message) })
    })
    const ack = await socketA.timeout(TIMEOUT_MS).emitWithAck('chat:send', { planId: plan.id, text: 'Hola desde A', clientId: randomBytes(8).toString('hex') })
    if (!ack.ok) fail(`chat:send → ${ack.error?.code}`)

    const message = await received
    if (message.id !== ack.message.id) fail('llegó otro mensaje')
    console.log(`chat entre instancias OK: ${urlA} → ${urlB} (mensaje ${message.id})`)
  } finally {
    socketA.disconnect()
    socketB.disconnect()
  }
}

try {
  await main()
} catch (err) {
  console.error(`chat entre instancias FALLÓ: ${err.message}`)
  process.exitCode = 1
}
