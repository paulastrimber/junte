import { render, screen } from '@testing-library/react-native'

import { dependentFieldState } from '../utils/catalog.js'
import { STUDY_TEXTS, StudyFields } from './StudyFields.jsx'

const OPTIONS = Object.freeze({ universities: [{ key: 'um', label: 'UM' }], careers: [], cities: [{ key: 'montevideo', label: 'Montevideo' }], neighborhoods: [] })

async function renderFields (values) {
  const dependents = {
    career: dependentFieldState(values.university, OPTIONS.careers),
    neighborhood: dependentFieldState(values.city, OPTIONS.neighborhoods)
  }
  await render(<StudyFields values={values} options={OPTIONS} dependents={dependents} errors={{}} onChange={jest.fn()} />)
}

// Onboarding y Perfil usan este mismo componente: misma situación, mismo texto en los dos.
describe('StudyFields', () => {
  it.each([
    ['sin universidad ni ciudad', { university: '', city: '' }, STUDY_TEXTS.careerHintNoUniversity, STUDY_TEXTS.neighborhoodHintNoCity],
    ['con "Otra" o sin opciones cargadas', { university: 'other', city: 'other' }, STUDY_TEXTS.careerHintOther, STUDY_TEXTS.neighborhoodHintOther]
  ])('%s: deshabilita carrera y barrio y explica por qué', async (_case, picked, careerHint, neighborhoodHint) => {
    await renderFields({ career: '', neighborhood: '', ...picked })

    expect(screen.getByRole('button', { name: STUDY_TEXTS.career })).toBeDisabled()
    expect(screen.getByRole('button', { name: STUDY_TEXTS.neighborhood })).toBeDisabled()
    expect(screen.getByText(careerHint)).toBeOnTheScreen()
    expect(screen.getByText(neighborhoodHint)).toBeOnTheScreen()
  })
})
