import { Button } from '../components/Button.jsx'
import { ChipGroup } from '../components/ChipGroup.jsx'
import { ErrorBanner } from '../components/ErrorBanner.jsx'
import { FormField } from '../components/FormField.jsx'
import { Notice } from '../components/Notice.jsx'
import { Screen } from '../components/Screen.jsx'
import { Text } from '../components/Text.jsx'
import { REPORT_STATUS, useReport } from '../hooks/useReport.js'
import { REPORT_DESCRIPTION_MAX_LENGTH, REPORT_REASONS } from '../services/api/reports.js'

export const TEXTS = Object.freeze({
  title: 'Reportar',
  heading: (label) => `Reportar ${label}`,
  privacy: 'Solo lo ve el equipo de moderación: la otra persona no se entera de quién lo reportó.',
  reason: 'Motivo',
  reasons: { spam: 'Spam', harassment: 'Acoso', inappropriate: 'Contenido inapropiado', scam: 'Estafa', other: 'Otro' },
  description: 'Contanos qué pasó',
  descriptionOptional: 'Contanos qué pasó (opcional)',
  descriptionPlaceholder: 'Lo que nos ayude a revisarlo',
  send: 'Enviar reporte',
  sent: 'Gracias. Vamos a revisarlo.',
  duplicate: 'Ya lo habías reportado: lo estamos revisando.',
  queued: 'Sin conexión: tu reporte quedó pendiente y se envía cuando vuelva la conexión.',
  back: 'Volver'
})

const OPTIONS = REPORT_REASONS.map((key) => ({ key, label: TEXTS.reasons[key] }))

/**
 * Reportar un plan, un usuario o un mensaje (S6-MOB-03). Llega con `{ targetType, targetId, label }`: `label` es cómo
 * se nombra lo reportado ("este plan", "a Ana", "este mensaje").
 */
export default function ReportScreen ({ navigation, route }) {
  const { targetType, targetId, label } = route.params
  const report = useReport({ targetType, targetId, label })
  const { setReason, setDescription, submit } = report

  if (report.status === REPORT_STATUS.SENT || report.status === REPORT_STATUS.QUEUED) {
    const message = report.status === REPORT_STATUS.QUEUED ? TEXTS.queued : (report.isDuplicate ? TEXTS.duplicate : TEXTS.sent)
    return (
      <Screen>
        <Notice tone={report.status === REPORT_STATUS.QUEUED ? 'warning' : 'success'} message={message} />
        <Button title={TEXTS.back} variant='secondary' onPress={() => navigation.goBack()} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Text variant='heading' accessibilityRole='header'>{TEXTS.heading(label)}</Text>
      <Text color='textMuted'>{TEXTS.privacy}</Text>
      <ChipGroup label={TEXTS.reason} options={OPTIONS} selected={report.reason ? [report.reason] : []} onSelect={setReason} />
      {report.fieldErrors.reason ? <ErrorBanner message={report.fieldErrors.reason} /> : null}
      <FormField
        label={report.reason === 'other' ? TEXTS.description : TEXTS.descriptionOptional}
        placeholder={TEXTS.descriptionPlaceholder}
        value={report.description}
        onChangeText={setDescription}
        maxLength={REPORT_DESCRIPTION_MAX_LENGTH}
        error={report.fieldErrors.description}
        multiline
      />
      <ErrorBanner message={report.formError?.message} requestId={report.formError?.requestId} />
      <Button title={TEXTS.send} variant='danger' loading={report.isSending} onPress={submit} />
    </Screen>
  )
}
