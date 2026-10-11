// Catálogos editables (docs/arquitectura/adr/0009-catalogos-en-la-base.md): intereses con categorías, universidades,
// carreras (de cada universidad), ciudades y barrios. Colecciones, validadores e índices; los datos iniciales los
// carga la migración siguiente. Autocontenida (no importa helpers). `down` quita índices y validadores y conserva datos.
const KEY = { bsonType: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 80 }
const NAME = { bsonType: 'string', minLength: 1, maxLength: 120 }
const COMMON = { key: KEY, name: NAME, order: { bsonType: 'int', minimum: 0 }, active: { bsonType: 'bool' } }

const schema = (required, extra) => ({
  $jsonSchema: { bsonType: 'object', required: ['key', 'name', 'order', 'active', ...required], properties: { ...COMMON, ...extra } }
})

const COLLECTIONS = [
  {
    name: 'interestCategories',
    validator: schema([], {}),
    indexes: [{ key: { key: 1 }, name: 'key_unique', unique: true }]
  },
  {
    name: 'interests',
    validator: schema(['categoryKey'], { categoryKey: KEY, minAge: { bsonType: 'int', minimum: 16, maximum: 99 } }),
    indexes: [
      { key: { key: 1 }, name: 'key_unique', unique: true },
      { key: { categoryKey: 1, order: 1 }, name: 'categoryKey_order' }
    ]
  },
  {
    name: 'universities',
    validator: schema(['shortName'], { shortName: { bsonType: 'string', minLength: 1, maxLength: 20 } }),
    indexes: [{ key: { key: 1 }, name: 'key_unique', unique: true }]
  },
  {
    name: 'careers',
    validator: schema(['universityKey'], { universityKey: KEY, group: NAME }),
    indexes: [{ key: { universityKey: 1, key: 1 }, name: 'universityKey_key_unique', unique: true }]
  },
  {
    name: 'cities',
    validator: schema(['department'], { department: NAME }),
    indexes: [{ key: { key: 1 }, name: 'key_unique', unique: true }]
  },
  {
    name: 'neighborhoods',
    validator: schema(['cityKey'], { cityKey: KEY, ineCode: { bsonType: 'int', minimum: 1 } }),
    indexes: [{ key: { cityKey: 1, key: 1 }, name: 'cityKey_key_unique', unique: true }]
  }
]

async function collectionExists (db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0
}

const isMissing = (err) => err?.codeName === 'IndexNotFound' || err?.codeName === 'NamespaceNotFound'

export async function up (db) {
  for (const { name, validator, indexes } of COLLECTIONS) {
    const options = { validator, validationLevel: 'moderate', validationAction: 'error' }
    if (await collectionExists(db, name)) await db.command({ collMod: name, ...options })
    else await db.createCollection(name, options)
    await db.collection(name).createIndexes(indexes)
  }
}

export async function down (db) {
  for (const { name, indexes } of COLLECTIONS) {
    for (const { name: indexName } of indexes) {
      try {
        await db.collection(name).dropIndex(indexName)
      } catch (err) {
        if (!isMissing(err)) throw err
      }
    }
    try {
      await db.command({ collMod: name, validator: {}, validationLevel: 'strict', validationAction: 'error' })
    } catch (err) {
      if (!isMissing(err)) throw err
    }
  }
}
