// Índices que tiene que haber después de `migrate-mongo up`: la tabla de
// docs/arquitectura/07-modelo-de-datos.md#índices, escrita a mano (independiente de las migraciones)
// para que `migrate:check` y los tests detecten una migración que no la cumple.
// Si cambia la tabla de 07, cambia esta lista y se agrega una migración, en el mismo PR.

/** @type {ReadonlyArray<{ collection: string, name: string, key: Record<string, 1 | -1 | '2dsphere'>, unique?: boolean, expireAfterSeconds?: number }>} */
export const EXPECTED_INDEXES = Object.freeze([
  { collection: 'users', name: 'email_unique', key: { email: 1 }, unique: true },
  { collection: 'users', name: 'role', key: { role: 1 } },
  { collection: 'plans', name: 'status_startsAt', key: { status: 1, startsAt: 1 } },
  { collection: 'plans', name: 'location_2dsphere', key: { location: '2dsphere' } },
  { collection: 'plans', name: 'creatorId_startsAt', key: { creatorId: 1, startsAt: -1 } },
  { collection: 'planParticipants', name: 'planId_userId_unique', key: { planId: 1, userId: 1 }, unique: true },
  { collection: 'planParticipants', name: 'userId_status', key: { userId: 1, status: 1 } },
  { collection: 'checkIns', name: 'planId_userId_unique', key: { planId: 1, userId: 1 }, unique: true },
  { collection: 'messages', name: 'planId_createdAt_id', key: { planId: 1, createdAt: -1, _id: -1 } },
  { collection: 'messages', name: 'senderId_clientId_unique', key: { senderId: 1, clientId: 1 }, unique: true },
  { collection: 'reports', name: 'status_createdAt', key: { status: 1, createdAt: 1 } },
  { collection: 'reports', name: 'reporterId_targetType_targetId_pending_unique', key: { reporterId: 1, targetType: 1, targetId: 1 }, unique: true },
  { collection: 'spotAlerts', name: 'planId_userId_unique', key: { planId: 1, userId: 1 }, unique: true },
  { collection: 'deviceTokens', name: 'token_unique', key: { token: 1 }, unique: true },
  { collection: 'deviceTokens', name: 'userId', key: { userId: 1 } },
  { collection: 'sessions', name: 'sid_unique', key: { sid: 1 }, unique: true },
  { collection: 'sessions', name: 'userId', key: { userId: 1 } },
  { collection: 'sessions', name: 'expiresAt_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  { collection: 'interestCategories', name: 'key_unique', key: { key: 1 }, unique: true },
  { collection: 'interests', name: 'key_unique', key: { key: 1 }, unique: true },
  { collection: 'interests', name: 'categoryKey_order', key: { categoryKey: 1, order: 1 } },
  { collection: 'universities', name: 'key_unique', key: { key: 1 }, unique: true },
  { collection: 'careers', name: 'universityKey_key_unique', key: { universityKey: 1, key: 1 }, unique: true },
  { collection: 'cities', name: 'key_unique', key: { key: 1 }, unique: true },
  { collection: 'neighborhoods', name: 'cityKey_key_unique', key: { cityKey: 1, key: 1 }, unique: true }
])

export const COLLECTIONS = Object.freeze([...new Set(EXPECTED_INDEXES.map((index) => index.collection))])

async function listIndexes (db, collection) {
  try {
    return await db.collection(collection).indexes()
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound') return []
    throw err
  }
}

function sameKey (a, b) {
  const entriesA = Object.entries(a)
  const entriesB = Object.entries(b)
  return entriesA.length === entriesB.length &&
    entriesA.every(([field, dir], i) => entriesB[i][0] === field && entriesB[i][1] === dir)
}

/**
 * Compara los índices reales con EXPECTED_INDEXES.
 * @param {import('mongodb').Db} db
 * @returns {Promise<string[]>} problemas encontrados (vacío si todo coincide).
 */
export async function findIndexProblems (db) {
  const problems = []
  for (const expected of EXPECTED_INDEXES) {
    const actual = (await listIndexes(db, expected.collection)).find((index) => index.name === expected.name)
    const label = `${expected.collection}.${expected.name}`
    if (!actual) {
      problems.push(`falta el índice ${label}`)
      continue
    }
    if (!sameKey(actual.key, expected.key)) {
      problems.push(`${label}: clave ${JSON.stringify(actual.key)}, se esperaba ${JSON.stringify(expected.key)}`)
    }
    if (Boolean(actual.unique) !== Boolean(expected.unique)) {
      problems.push(`${label}: unique=${Boolean(actual.unique)}, se esperaba ${Boolean(expected.unique)}`)
    }
    if (actual.expireAfterSeconds !== expected.expireAfterSeconds) {
      problems.push(`${label}: expireAfterSeconds=${actual.expireAfterSeconds}, se esperaba ${expected.expireAfterSeconds}`)
    }
  }
  return problems
}

/**
 * Índices que no son `_id_` en las colecciones de junte (para verificar que `down` los quitó).
 * @param {import('mongodb').Db} db
 * @returns {Promise<string[]>} `coleccion.indice` que siguen existiendo.
 */
export async function findLeftoverIndexes (db) {
  const leftovers = []
  for (const collection of COLLECTIONS) {
    for (const index of await listIndexes(db, collection)) {
      if (index.name !== '_id_') leftovers.push(`${collection}.${index.name}`)
    }
  }
  return leftovers
}
