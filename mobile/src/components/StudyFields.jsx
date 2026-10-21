import { StyleSheet, View } from 'react-native'

import { spacing } from '../theme/index.js'
import { DEPENDENT_REASON } from '../utils/catalog.js'
import { SelectField } from './SelectField.jsx'

/** Textos de los campos de estudio y zona: los mismos en el onboarding y en el perfil. */
export const STUDY_TEXTS = Object.freeze({
  university: 'Universidad',
  career: 'Carrera',
  city: 'Ciudad',
  neighborhood: 'Barrio',
  careerHintNoUniversity: 'Elegí primero una universidad.',
  careerHintOther: 'No tenemos las carreras de esa universidad.',
  neighborhoodHintNoCity: 'Elegí primero una ciudad.',
  neighborhoodHintOther: 'Solo tenemos barrios de Montevideo.'
})

const HINTS = Object.freeze({
  career: { [DEPENDENT_REASON.NO_PARENT]: STUDY_TEXTS.careerHintNoUniversity, [DEPENDENT_REASON.NO_OPTIONS]: STUDY_TEXTS.careerHintOther },
  neighborhood: { [DEPENDENT_REASON.NO_PARENT]: STUDY_TEXTS.neighborhoodHintNoCity, [DEPENDENT_REASON.NO_OPTIONS]: STUDY_TEXTS.neighborhoodHintOther }
})

/**
 * Universidad, carrera, ciudad y barrio. La carrera depende de la universidad y el barrio de la ciudad: cuándo se
 * deshabilitan lo decide `useProfileDraft` (`dependents`); acá solo se elige el texto que lo explica.
 * Presentacional: lo usan el onboarding (paso 2) y el perfil.
 * @param {object} props
 * @param {{ university: string, career: string, city: string, neighborhood: string }} props.values
 * @param {{ universities: object[], careers: object[], cities: object[], neighborhoods: object[] }} props.options
 * @param {{ career: { disabled: boolean, reason: string | null }, neighborhood: { disabled: boolean, reason: string | null } }} props.dependents
 * @param {Record<string, string | undefined>} props.errors
 * @param {(field: string, key: string) => void} props.onChange
 */
export function StudyFields ({ values, options, dependents, errors, onChange }) {
  const { career, neighborhood } = dependents
  return (
    <View style={styles.group}>
      <SelectField label={STUDY_TEXTS.university} value={values.university} options={options.universities} onChange={(key) => onChange('university', key)} error={errors.university} />
      <SelectField
        label={STUDY_TEXTS.career}
        value={values.career}
        options={options.careers}
        allowOther={!career.disabled}
        disabled={career.disabled}
        hint={HINTS.career[career.reason]}
        onChange={(key) => onChange('career', key)}
        error={errors.career}
      />
      <SelectField label={STUDY_TEXTS.city} value={values.city} options={options.cities} onChange={(key) => onChange('city', key)} error={errors.city} />
      <SelectField
        label={STUDY_TEXTS.neighborhood}
        value={values.neighborhood}
        options={options.neighborhoods}
        allowOther={!neighborhood.disabled}
        disabled={neighborhood.disabled}
        hint={HINTS.neighborhood[neighborhood.reason]}
        onChange={(key) => onChange('neighborhood', key)}
        error={errors.neighborhood}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.lg }
})
