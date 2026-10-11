import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDb, stopDb } from '../helpers/db.js'
import { getConnection } from '../../src/adapters/db/index.js'
import { migrationStatus, rollbackMigrations, runMigrations } from '../../src/adapters/db/migrations.js'
import { findIndexProblems, findLeftoverIndexes } from '../../src/adapters/db/expected-indexes.js'

beforeAll(startDb)
afterAll(stopDb)

const pending = async (db) => (await migrationStatus(db)).filter((item) => item.appliedAt === 'PENDING')

describe('migraciones', () => {
  it('up → down → up queda limpio y con los índices de 07', async () => {
    const connection = getConnection()
    const { db } = connection
    const client = connection.getClient()
    expect(await pending(db)).toEqual([])

    const reverted = await rollbackMigrations(db, client)

    expect(reverted.length).toBeGreaterThan(0)
    expect(await findLeftoverIndexes(db)).toEqual([])
    expect((await pending(db)).length).toBe(reverted.length)

    const reapplied = await runMigrations(db, client)

    expect(reapplied).toEqual([...reverted].reverse())
    expect(await pending(db)).toEqual([])
    expect(await findIndexProblems(db)).toEqual([])
  })

  it('down también quita los validadores', async () => {
    const connection = getConnection()
    await rollbackMigrations(connection.db, connection.getClient())

    const [plans] = await connection.db.listCollections({ name: 'plans' }).toArray()

    expect(plans.options.validator ?? {}).toEqual({})
    await runMigrations(connection.db, connection.getClient())
  })

  it('la migración de perfil quita users.refreshTokenHash de los usuarios existentes y conserva el resto', async () => {
    const { db } = getConnection()
    const { up, down } = await import('../../migrations/20261011180100-users-profile-and-drop-refresh-token-hash.js')
    await down(db) // estado anterior: validador viejo, sin que cambie el changelog
    await db.collection('users').insertOne({
      email: 'viejo@test.junte', passwordHash: 'x', role: 'user', status: 'active', refreshTokenHash: 'abc', name: 'Viejo'
    })

    await up(db)

    const user = await db.collection('users').findOne({ email: 'viejo@test.junte' })
    expect(user).not.toHaveProperty('refreshTokenHash')
    expect(user).toMatchObject({ name: 'Viejo', email: 'viejo@test.junte' })
    await db.collection('users').deleteMany({})
  })
})
