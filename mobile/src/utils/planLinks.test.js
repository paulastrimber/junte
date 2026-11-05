import { planIdFromLink, planInviteMessage, planLink } from './planLinks.js'

const ID = '885f1c2a9b1e8a001234567a'

describe('enlaces a un plan', () => {
  it('planLink y planIdFromLink van y vuelven', () => {
    expect(planLink(ID)).toBe(`junte://plans/${ID}`)
    expect(planIdFromLink(planLink(ID))).toBe(ID)
    expect(planIdFromLink(`junte:///plans/${ID}/?ref=x`)).toBe(ID)
  })

  it('cualquier otra cosa no es un plan', () => {
    for (const url of [null, 'https://junte.app/plans/' + ID, 'junte://plans/no-es-un-id', `junte://users/${ID}`]) {
      expect(planIdFromLink(url)).toBeNull()
    }
  })

  it('el texto para invitar lleva título, cuándo, dónde y el enlace', () => {
    const text = planInviteMessage({ id: ID, title: 'Fútbol', startsAt: 'a', endsAt: 'b', location: { label: 'Parque Rodó' } }, () => 'sáb 10:00')
    expect(text).toBe(`Sumate a "Fútbol" en junte: sáb 10:00, Parque Rodó.\njunte://plans/${ID}`)
  })
})
