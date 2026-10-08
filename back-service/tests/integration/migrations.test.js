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
})
