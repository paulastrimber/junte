import { describe, expect, it, vi } from 'vitest'
import { createFixedClock } from '../../adapters/clock.js'
import { AppError } from '../../shared/errors.js'
import { createMessageService } from './message.service.js'

const CREATOR_ID = '665f1c2a9b1e8a0012345678'
const MEMBER_ID = '775f1c2a9b1e8a0012345679'
const STRANGER_ID = '995f1c2a9b1e8a001234567b'
const PLAN_ID = '885f1c2a9b1e8a001234567a'
const OTHER_PLAN_ID = '885f1c2a9b1e8a001234567c'
const NOW = '2026-10-14T15:00:00Z'

function setup ({ visible = true, existing = [] } = {}) {
  const clock = createFixedClock(NOW)
  const messages = [...existing]
  let nextId = 0
  const plans = {
    requireVisible: vi.fn(async () => {
      if (!visible) throw new AppError('NOT_FOUND', 'No encontramos ese plan')
      return { id: PLAN_ID, creatorId: CREATOR_ID }
    })
  }
  const participationRepo = { isActiveParticipant: vi.fn(async (planId, userId) => userId === MEMBER_ID) }
  const messageRepo = {
    create: vi.fn(async ({ planId, senderId, text, clientId, at }) => {
      const found = clientId && messages.find((message) => message.senderId === senderId && message.clientId === clientId)
      if (found) return { message: found, created: false }
      const message = { id: `m${++nextId}`, planId, senderId, text, status: 'visible', clientId: clientId ?? null, createdAt: at }
      messages.push(message)
      return { message, created: true }
    }),
    listVisibleByPlan: vi.fn(async ({ limit }) => messages.slice(0, limit))
  }
  const userRepo = { findByIds: vi.fn(async (ids) => ids.map((id) => ({ id, name: id === CREATOR_ID ? 'Ana' : 'Beto' }))) }
  const broadcaster = { publishMessage: vi.fn() }
  const logger = { info: vi.fn() }
  const service = createMessageService({ plans, participationRepo, messageRepo, userRepo, broadcaster, clock, logger })
  return { service, messages, broadcaster, logger }
}

const expectCode = async (promise, code) => expect(promise).rejects.toMatchObject({ code })

describe('messageService.requireMember', () => {
  it('deja pasar al creador y al participante activo', async () => {
    const { service } = setup()

    await expect(service.requireMember({ planId: PLAN_ID, userId: CREATOR_ID })).resolves.toMatchObject({ id: PLAN_ID })
    await expect(service.requireMember({ planId: PLAN_ID, userId: MEMBER_ID })).resolves.toMatchObject({ id: PLAN_ID })
  })

  it('rechaza con FORBIDDEN a quien ve el plan pero no está anotado', async () => {
    const { service } = setup()

    await expectCode(service.requireMember({ planId: PLAN_ID, userId: STRANGER_ID }), 'FORBIDDEN')
  })

  it('responde NOT_FOUND si el plan no le es visible (no revela que existe)', async () => {
    const { service } = setup({ visible: false })

    await expectCode(service.requireMember({ planId: PLAN_ID, userId: MEMBER_ID }), 'NOT_FOUND')
  })
})

describe('messageService.send', () => {
  it('guarda el mensaje con la hora del back, el remitente del token, y lo emite a la sala', async () => {
    const { service, broadcaster } = setup()

    const result = await service.send({ planId: PLAN_ID, userId: MEMBER_ID, text: 'Hola', clientId: 'abc' })

    expect(result).toMatchObject({ created: true, message: { senderId: MEMBER_ID, text: 'Hola', createdAt: new Date(NOW) }, sender: { id: MEMBER_ID } })
    expect(broadcaster.publishMessage).toHaveBeenCalledTimes(1)
    expect(broadcaster.publishMessage).toHaveBeenCalledWith(expect.objectContaining({ message: result.message }))
  })

  it('un reintento con el mismo clientId devuelve el mismo mensaje y no lo vuelve a emitir', async () => {
    const { service, messages, broadcaster } = setup()

    const first = await service.send({ planId: PLAN_ID, userId: MEMBER_ID, text: 'Hola', clientId: 'abc' })
    const retry = await service.send({ planId: PLAN_ID, userId: MEMBER_ID, text: 'Hola', clientId: 'abc' })

    expect(retry).toMatchObject({ created: false, message: { id: first.message.id } })
    expect(messages).toHaveLength(1)
    expect(broadcaster.publishMessage).toHaveBeenCalledTimes(1)
  })

  it('el mismo clientId en otro plan es un error de validación, no un reintento', async () => {
    const existing = [{ id: 'm0', planId: OTHER_PLAN_ID, senderId: MEMBER_ID, text: 'x', status: 'visible', clientId: 'abc', createdAt: new Date(NOW) }]
    const { service, broadcaster } = setup({ existing })

    await expectCode(service.send({ planId: PLAN_ID, userId: MEMBER_ID, text: 'Hola', clientId: 'abc' }), 'VALIDATION_ERROR')
    expect(broadcaster.publishMessage).not.toHaveBeenCalled()
  })

  it('no participante: FORBIDDEN y no guarda nada', async () => {
    const { service, messages } = setup()

    await expectCode(service.send({ planId: PLAN_ID, userId: STRANGER_ID, text: 'Hola' }), 'FORBIDDEN')
    expect(messages).toHaveLength(0)
  })

  it('nunca loguea el texto del mensaje', async () => {
    const { service, logger } = setup()

    await service.send({ planId: PLAN_ID, userId: MEMBER_ID, text: 'texto privado' })

    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('texto privado')
  })
})

describe('messageService.list', () => {
  it('un cursor manipulado es VALIDATION_ERROR', async () => {
    const { service } = setup()

    await expectCode(service.list({ planId: PLAN_ID, userId: MEMBER_ID, limit: 20, cursor: 'bm8tZXMtdW4tY3Vyc29y' }), 'VALIDATION_ERROR')
  })
})
