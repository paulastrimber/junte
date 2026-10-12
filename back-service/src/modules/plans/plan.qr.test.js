import { describe, expect, it } from 'vitest'
import { createQrChallenge, matchesQrChallenge } from './plan.qr.js'
import { canTransition } from './plan.rules.js'

const PLAN_ID = '885f1c2a9b1e8a001234567a'
const OTHER_PLAN_ID = '995f1c2a9b1e8a001234567b'

describe('desafío QR', () => {
  it('el token lleva el plan y un nonce de 32 bytes; el hash es SHA-256 en hex', () => {
    const { qrToken, qrNonceHash } = createQrChallenge(PLAN_ID)

    const [planId, nonce] = qrToken.split('.')
    expect(planId).toBe(PLAN_ID)
    expect(Buffer.from(nonce, 'base64url')).toHaveLength(32)
    expect(qrNonceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(qrNonceHash).not.toContain(nonce)
  })

  it('cada desafío es distinto', () => {
    expect(createQrChallenge(PLAN_ID).qrToken).not.toBe(createQrChallenge(PLAN_ID).qrToken)
  })

  it('reconoce el token vigente', () => {
    const { qrToken, qrNonceHash } = createQrChallenge(PLAN_ID)

    expect(matchesQrChallenge({ qrToken, planId: PLAN_ID, qrNonceHash })).toBe(true)
  })

  it('rechaza el token de otro plan, aunque el nonce coincida', () => {
    const { qrToken, qrNonceHash } = createQrChallenge(PLAN_ID)
    const forged = qrToken.replace(PLAN_ID, OTHER_PLAN_ID)

    expect(matchesQrChallenge({ qrToken, planId: OTHER_PLAN_ID, qrNonceHash })).toBe(false)
    expect(matchesQrChallenge({ qrToken: forged, planId: PLAN_ID, qrNonceHash })).toBe(false)
  })

  it('rechaza un token anterior (otro nonce)', () => {
    const previous = createQrChallenge(PLAN_ID)
    const current = createQrChallenge(PLAN_ID)

    expect(matchesQrChallenge({ qrToken: previous.qrToken, planId: PLAN_ID, qrNonceHash: current.qrNonceHash })).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['un objeto', { $ne: null }],
    ['solo el ID del plan', PLAN_ID],
    ['sin nonce', `${PLAN_ID}.`],
    ['un nonce de otro largo', `${PLAN_ID}.abc`],
    ['caracteres fuera de base64url', `${PLAN_ID}.${'*'.repeat(43)}`]
  ])('rechaza %s sin lanzar', (_label, qrToken) => {
    const { qrNonceHash } = createQrChallenge(PLAN_ID)

    expect(matchesQrChallenge({ qrToken, planId: PLAN_ID, qrNonceHash })).toBe(false)
  })

  it('rechaza todo si el plan no tiene un desafío guardado', () => {
    const { qrToken } = createQrChallenge(PLAN_ID)

    expect(matchesQrChallenge({ qrToken, planId: PLAN_ID, qrNonceHash: undefined })).toBe(false)
  })
})

describe('canTransition (cambios de estado del creador)', () => {
  const startsAt = new Date('2028-03-03T18:00:00Z')
  const endsAt = new Date('2028-03-03T20:00:00Z')
  const before = new Date('2028-03-03T17:59:59Z')
  const during = new Date('2028-03-03T19:00:00Z')
  const plan = (status) => ({ status, startsAt, endsAt })

  it.each([
    ['open → closed antes de empezar', 'open', 'closed', before, true],
    ['closed → open antes de empezar', 'closed', 'open', before, true],
    ['open → closed con el plan empezado', 'open', 'closed', startsAt, false],
    ['closed → open con el plan empezado', 'closed', 'open', during, false],
    ['open → cancelled antes de empezar', 'open', 'cancelled', before, true],
    ['closed → cancelled durante el plan', 'closed', 'cancelled', during, true],
    ['open → cancelled cuando ya terminó', 'open', 'cancelled', endsAt, false],
    ['cancelled → open (es final)', 'cancelled', 'open', before, false],
    ['completed → cancelled (es final)', 'completed', 'cancelled', before, false],
    ['open → completed (lo pone solo el back)', 'open', 'completed', during, false]
  ])('%s', (_label, from, to, now, expected) => {
    expect(canTransition({ plan: plan(from), to, now })).toBe(expected)
  })
})
