import { MESSAGE_STATUS, createClientId, formatMessageTime, mergeMessages, mergeRecoveredPage, sortMessages } from './chat.js'

const message = (id, createdAt, extra = {}) => ({ id, planId: 'p1', sender: { id: 'u1', name: 'Ana' }, type: 'text', text: id, clientId: null, createdAt, ...extra })
const sent = (id, createdAt, extra) => ({ ...message(id, createdAt, extra), status: MESSAGE_STATUS.SENT })
const ids = (list) => list.map((item) => item.id)

describe('createClientId', () => {
  it('cumple el formato que acepta el servidor y es distinto cada vez', () => {
    const a = createClientId()
    const b = createClientId()

    expect(a).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(a).not.toBe(b)
  })

  it('usa el reloj y el azar que se le inyectan', () => {
    expect(createClientId(() => 36, () => 0.5)).toBe('10-i')
  })
})

describe('sortMessages', () => {
  it('deja primero el más nuevo y desempata por id', () => {
    const list = [message('a', '2026-10-14T10:00:00Z'), message('c', '2026-10-14T10:05:00Z'), message('b', '2026-10-14T10:05:00Z')].map((m) => ({ ...m, status: 'sent' }))

    expect(ids(sortMessages(list))).toEqual(['c', 'b', 'a'])
  })

  it('los pendientes y fallidos van arriba aunque el reloj del teléfono atrase', () => {
    const list = [sent('m1', '2026-10-14T10:05:00Z'), { ...message('local-x', '2026-10-14T10:00:00Z'), status: MESSAGE_STATUS.PENDING }]

    expect(ids(sortMessages(list))).toEqual(['local-x', 'm1'])
  })

  it('no modifica la lista original', () => {
    const list = [sent('a', '2026-10-14T10:00:00Z'), sent('b', '2026-10-14T10:01:00Z')]

    sortMessages(list)

    expect(ids(list)).toEqual(['a', 'b'])
  })
})

describe('mergeMessages', () => {
  it('suma los nuevos marcándolos como enviados y ordena', () => {
    const merged = mergeMessages([sent('m1', '2026-10-14T10:00:00Z')], [message('m2', '2026-10-14T10:01:00Z')])

    expect(ids(merged)).toEqual(['m2', 'm1'])
    expect(merged[0].status).toBe(MESSAGE_STATUS.SENT)
  })

  it('un mensaje repetido (mismo id) no se duplica', () => {
    const merged = mergeMessages([sent('m1', '2026-10-14T10:00:00Z')], [message('m1', '2026-10-14T10:00:00Z')])

    expect(merged).toHaveLength(1)
  })

  it('reemplaza el envío pendiente o fallido que tiene el mismo clientId', () => {
    const pending = { ...message('local-c1', '2026-10-14T10:00:00Z', { clientId: 'c1' }), status: MESSAGE_STATUS.PENDING }
    const failed = { ...message('local-c2', '2026-10-14T10:00:01Z', { clientId: 'c2' }), status: MESSAGE_STATUS.FAILED }

    const merged = mergeMessages([failed, pending], [message('m1', '2026-10-14T10:00:02Z', { clientId: 'c1' }), message('m2', '2026-10-14T10:00:03Z', { clientId: 'c2' })])

    expect(ids(merged)).toEqual(['m2', 'm1'])
    expect(merged.every((item) => item.status === MESSAGE_STATUS.SENT)).toBe(true)
  })

  it('un mensaje ajeno con un clientId igual al de uno ya enviado no pisa nada raro', () => {
    const merged = mergeMessages([sent('m1', '2026-10-14T10:00:00Z', { clientId: 'c1' })], [message('m2', '2026-10-14T10:01:00Z', { clientId: 'c1' })])

    expect(ids(merged)).toEqual(['m2', 'm1'])
  })
})

describe('mergeMessages: identidad de lo que no cambió', () => {
  const photo = (signature) => `https://bucket.s3.amazonaws.com/users/u1/foto.jpg?X-Amz-Expires=600&X-Amz-Signature=${signature}`
  const withPhoto = (id, createdAt, signature) => message(id, createdAt, { sender: { id: 'u1', name: 'Ana', photoUrl: photo(signature) } })

  it('si llegan los mismos mensajes devuelve la misma lista', () => {
    const current = mergeMessages([], [message('m2', '2026-10-14T10:01:00Z'), message('m1', '2026-10-14T10:00:00Z')])

    expect(mergeMessages(current, [message('m1', '2026-10-14T10:00:00Z'), message('m2', '2026-10-14T10:01:00Z')])).toBe(current)
  })

  it('si solo cambió la firma de la foto conserva los objetos (y la URL que ya se cargó)', () => {
    const current = mergeMessages([], [withPhoto('m1', '2026-10-14T10:00:00Z', 'a')])

    const merged = mergeMessages(current, [withPhoto('m1', '2026-10-14T10:00:00Z', 'b')])

    expect(merged).toBe(current)
    expect(merged[0].sender.photoUrl).toBe(photo('a'))
  })

  it('con un mensaje nuevo conserva los objetos de los que no cambiaron', () => {
    const current = mergeMessages([], [withPhoto('m1', '2026-10-14T10:00:00Z', 'a')])

    const merged = mergeMessages(current, [withPhoto('m2', '2026-10-14T10:01:00Z', 'b'), withPhoto('m1', '2026-10-14T10:00:00Z', 'b')])

    expect(ids(merged)).toEqual(['m2', 'm1'])
    expect(merged[1]).toBe(current[0])
  })

  it('si cambió algo del mensaje o la foto es otra, lo reemplaza', () => {
    const current = mergeMessages([], [withPhoto('m1', '2026-10-14T10:00:00Z', 'a')])
    const otherPhoto = { ...withPhoto('m1', '2026-10-14T10:00:00Z', 'a'), sender: { id: 'u1', name: 'Ana', photoUrl: 'https://bucket.s3.amazonaws.com/users/u1/otra.jpg?X-Amz-Signature=c' } }

    expect(mergeMessages(current, [{ ...withPhoto('m1', '2026-10-14T10:00:00Z', 'a'), text: 'editado' }])[0].text).toBe('editado')
    expect(mergeMessages(current, [otherPhoto])[0].sender.photoUrl).toContain('otra.jpg')
  })
})

describe('mergeRecoveredPage', () => {
  it('con mensajes en común solo suma los que faltaban', () => {
    const current = [sent('m2', '2026-10-14T10:02:00Z'), sent('m1', '2026-10-14T10:01:00Z')]
    const page = { items: [message('m3', '2026-10-14T10:03:00Z'), message('m2', '2026-10-14T10:02:00Z')], nextCursor: 'next' }

    const result = mergeRecoveredPage(current, page)

    expect(ids(result.messages)).toEqual(['m3', 'm2', 'm1'])
    expect(result.isReplaced).toBe(false)
  })

  it('sin nada en común y con más historia hay un hueco: se queda con la página y conserva lo no confirmado', () => {
    const pending = { ...message('local-c1', '2026-10-14T10:00:00Z', { clientId: 'c1' }), status: MESSAGE_STATUS.PENDING }
    const current = [pending, sent('m1', '2026-10-14T09:00:00Z')]
    const page = { items: [message('m9', '2026-10-14T10:09:00Z'), message('m8', '2026-10-14T10:08:00Z')], nextCursor: 'next' }

    const result = mergeRecoveredPage(current, page)

    expect(ids(result.messages)).toEqual(['local-c1', 'm9', 'm8'])
    expect(result.isReplaced).toBe(true)
  })

  it('sin nada en común pero con toda la historia en la página no hay hueco', () => {
    const current = [sent('m1', '2026-10-14T09:00:00Z')]
    const page = { items: [message('m2', '2026-10-14T10:00:00Z')], nextCursor: null }

    const result = mergeRecoveredPage(current, page)

    expect(ids(result.messages)).toEqual(['m2', 'm1'])
    expect(result.isReplaced).toBe(false)
  })

  it('si todavía no había mensajes enviados toma el cursor de la página', () => {
    const result = mergeRecoveredPage([], { items: [message('m1', '2026-10-14T10:00:00Z')], nextCursor: 'next' })

    expect(ids(result.messages)).toEqual(['m1'])
    expect(result.isReplaced).toBe(true)
  })
})

describe('formatMessageTime', () => {
  const now = new Date(2026, 9, 14, 18, 0)

  it('de hoy: solo la hora', () => {
    expect(formatMessageTime(new Date(2026, 9, 14, 9, 5).toISOString(), now)).toBe('09:05')
  })

  it('de otro día: con el día y el mes', () => {
    expect(formatMessageTime(new Date(2026, 9, 12, 14, 30).toISOString(), now)).toBe('12/10 14:30')
  })

  it('una fecha inválida no rompe', () => {
    expect(formatMessageTime('ayer', now)).toBe('')
  })
})
