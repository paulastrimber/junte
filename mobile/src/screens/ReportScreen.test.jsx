import { fireEvent, render, screen } from '@testing-library/react-native'

import { ApiError, CLIENT_ERROR_CODES } from '../services/api/errors.js'
import { createReport } from '../services/api/reports.js'
import { connectivity, outbox } from '../services/offline/index.js'
import ReportScreen, { TEXTS } from './ReportScreen.jsx'

jest.mock('../services/api/reports.js', () => ({
  ...jest.requireActual('../services/api/reports.js'),
  createReport: jest.fn()
}))

const navigation = { goBack: jest.fn() }
const route = { params: { targetType: 'plan', targetId: 'p1', label: 'este plan' } }

async function renderReport () {
  return render(<ReportScreen navigation={navigation} route={route} />)
}

const send = () => fireEvent.press(screen.getByRole('button', { name: TEXTS.send }))

beforeEach(async () => {
  createReport.mockReset()
  navigation.goBack.mockReset()
  await outbox.clear()
  jest.spyOn(connectivity, 'isOnline').mockReturnValue(true)
})

afterEach(() => jest.restoreAllMocks())

describe('ReportScreen', () => {
  it('muestra qué se reporta, los motivos y que es anónimo para la otra persona', async () => {
    await renderReport()

    expect(screen.getByRole('header', { name: 'Reportar este plan' })).toBeOnTheScreen()
    expect(screen.getByText(TEXTS.privacy)).toBeOnTheScreen()
    for (const label of Object.values(TEXTS.reasons)) expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen()
  })

  it('sin motivo no manda nada; con "otro" pide la descripción', async () => {
    await renderReport()

    await send()
    expect(screen.getByText('Elegí un motivo.')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('radio', { name: TEXTS.reasons.other }))
    await send()

    expect(screen.getByText('Contanos qué pasó.')).toBeOnTheScreen()
    expect(createReport).not.toHaveBeenCalled()
  })

  it('manda el reporte (sin campos de más) y agradece cuando el servidor lo acepta', async () => {
    createReport.mockResolvedValue({ id: 'r1', status: 'pending', isDuplicate: false })
    await renderReport()

    await fireEvent.press(screen.getByRole('radio', { name: TEXTS.reasons.scam }))
    await fireEvent.changeText(screen.getByLabelText(TEXTS.descriptionOptional), '  Pide plata por adelantado  ')
    await send()

    expect(createReport).toHaveBeenCalledWith({ targetType: 'plan', targetId: 'p1', reason: 'scam', description: 'Pide plata por adelantado' })
    expect(await screen.findByText(TEXTS.sent)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: TEXTS.back }))
    expect(navigation.goBack).toHaveBeenCalled()
  })

  it('si ya lo había reportado, lo dice', async () => {
    createReport.mockResolvedValue({ id: 'r1', status: 'pending', isDuplicate: true })
    await renderReport()

    await fireEvent.press(screen.getByRole('radio', { name: TEXTS.reasons.spam }))
    await send()

    expect(await screen.findByText(TEXTS.duplicate)).toBeOnTheScreen()
  })

  it('sin red queda pendiente en la cola (no se da por enviado)', async () => {
    createReport.mockRejectedValue(new ApiError({ status: 0, code: CLIENT_ERROR_CODES.NETWORK_ERROR }))
    await renderReport()

    await fireEvent.press(screen.getByRole('radio', { name: TEXTS.reasons.spam }))
    await send()

    expect(await screen.findByText(TEXTS.queued)).toBeOnTheScreen()
    expect(await outbox.list()).toEqual([expect.objectContaining({ type: 'report', payload: { targetType: 'plan', targetId: 'p1', reason: 'spam', label: 'este plan' } })])
  })

  it('un error del servidor se muestra y deja corregir', async () => {
    createReport.mockRejectedValue(new ApiError({ status: 404, code: 'NOT_FOUND', requestId: 'r9' }))
    await renderReport()

    await fireEvent.press(screen.getByRole('radio', { name: TEXTS.reasons.spam }))
    await send()

    expect(await screen.findByText('Lo que querés reportar ya no está disponible.')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: TEXTS.send })).toBeOnTheScreen()
  })
})
