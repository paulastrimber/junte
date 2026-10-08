import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startDb, stopDb } from '../helpers/db.js'
import { connectDb, disconnectDb, pingDb } from '../../src/adapters/db/index.js'

let uri
let dbName

beforeAll(async () => {
  ({ uri, dbName } = await startDb())
})
afterAll(stopDb)

describe('adapter de MongoDB', () => {
  it('pingDb devuelve true con la conexión abierta', async () => {
    expect(await pingDb()).toBe(true)
  })

  it('pingDb devuelve false sin conexión, sin lanzar', async () => {
    await disconnectDb()

    expect(await pingDb()).toBe(false)

    await connectDb(uri, { dbName })
  })

  it('disconnectDb es idempotente', async () => {
    await disconnectDb()

    await expect(disconnectDb()).resolves.toBeUndefined()

    await connectDb(uri, { dbName })
  })

  it('connectDb sin URI falla con un mensaje claro', async () => {
    await expect(connectDb('')).rejects.toThrow(/MONGO_URI/)
  })
})
