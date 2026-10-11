// users: universidad, carrera, ciudad, barrio e intereses pasan de texto libre a claves de los catálogos
// (20261011190000/190100), más `career` y `onboardingCompletedAt`; el máximo de intereses sube de 5 a 10.
//
// Datos existentes (texto libre → clave): se compara sin mayúsculas ni tildes con el nombre o la sigla del catálogo;
// lo que no coincide pasa a la opción reservada `other` ("Otra"), sin conservar el texto. El barrio solo queda si la
// ciudad es una del catálogo y el barrio es uno de esa ciudad. Los intereses que ya no existan se quitan.
// `down` restaura el validador anterior y NO revierte los datos (las claves también son strings válidos para el viejo).
const OTHER = 'other'
const KEY_PATTERN = '^([a-z0-9]+(-[a-z0-9]+)*)$'

const BASE_PROPERTIES = {
  email: { bsonType: 'string', minLength: 3, pattern: '^[^A-Z\\s]+$' },
  passwordHash: { bsonType: 'string', minLength: 1 },
  role: { enum: ['user', 'admin'] },
  status: { enum: ['active', 'suspended'] },
  reputation: { bsonType: 'number' },
  birthDate: { bsonType: 'date' }
}

const PREVIOUS_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'status'],
    properties: {
      ...BASE_PROPERTIES,
      interests: { bsonType: 'array', maxItems: 5, items: { bsonType: 'string' } },
      neighborhood: { bsonType: 'string', minLength: 1, maxLength: 60 },
      city: { bsonType: 'string', minLength: 1, maxLength: 60 }
    }
  }
}

const keyField = { bsonType: 'string', pattern: KEY_PATTERN, maxLength: 80 }

const VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'role', 'status'],
    properties: {
      ...BASE_PROPERTIES,
      interests: { bsonType: 'array', maxItems: 10, items: keyField },
      university: keyField,
      career: keyField,
      city: keyField,
      neighborhood: keyField,
      onboardingCompletedAt: { bsonType: 'date' }
    }
  }
}

const OPTIONS = { validationLevel: 'moderate', validationAction: 'error' }

const normalize = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

async function lookup (db, collection, labels) {
  const map = new Map()
  for (const doc of await db.collection(collection).find({}).toArray()) {
    for (const label of labels(doc)) map.set(normalize(label), doc)
  }
  return map
}

async function convertExistingUsers (db) {
  const universities = await lookup(db, 'universities', (doc) => [doc.name, doc.shortName, doc.key])
  const cities = await lookup(db, 'cities', (doc) => [doc.name, doc.key])
  const neighborhoods = await db.collection('neighborhoods').find({}).toArray()
  const interestKeys = new Set((await db.collection('interests').find({}).toArray()).map((doc) => doc.key))

  const users = db.collection('users')
  for (const user of await users.find({}).toArray()) {
    const $set = {}
    const $unset = {}

    if (typeof user.university === 'string') $set.university = universities.get(normalize(user.university))?.key ?? OTHER

    let cityKey = null
    if (typeof user.city === 'string') {
      cityKey = cities.get(normalize(user.city))?.key ?? OTHER
      $set.city = cityKey
    }
    if (typeof user.neighborhood === 'string') {
      const match = cityKey && cityKey !== OTHER
        ? neighborhoods.find((doc) => doc.cityKey === cityKey && normalize(doc.name) === normalize(user.neighborhood))
        : null
      if (match) $set.neighborhood = match.key
      else if (cityKey && cityKey !== OTHER) $set.neighborhood = OTHER
      else $unset.neighborhood = ''
    }
    if (Array.isArray(user.interests)) $set.interests = user.interests.filter((key) => interestKeys.has(key)).slice(0, 10)

    const update = {}
    if (Object.keys($set).length > 0) update.$set = $set
    if (Object.keys($unset).length > 0) update.$unset = $unset
    if (Object.keys(update).length > 0) await users.updateOne({ _id: user._id }, update)
  }
}

export async function up (db) {
  await convertExistingUsers(db)
  await db.command({ collMod: 'users', validator: VALIDATOR, ...OPTIONS })
}

export async function down (db) {
  await db.command({ collMod: 'users', validator: PREVIOUS_VALIDATOR, ...OPTIONS })
}
