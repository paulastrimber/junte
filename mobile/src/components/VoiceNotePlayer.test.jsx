import { act, fireEvent, render } from '@testing-library/react-native'

import { TEXTS, VoiceNotePlayer } from './VoiceNotePlayer.jsx'

const audio = require('expo-audio')

const failing = (uri) => audio.__players.find((player) => player.source?.uri === uri)

describe('VoiceNotePlayer: URL vencida', () => {
  const defaultStatus = audio.useAudioPlayerStatus.getMockImplementation()
  afterEach(() => audio.useAudioPlayerStatus.mockImplementation(defaultStatus))

  it('si el audio no carga pide una URL nueva una sola vez y, cuando llega, reintenta el play', async () => {
    const onExpired = jest.fn()
    const view = await render(<VoiceNotePlayer source='https://s3/a.m4a?s=1' durationMs={3000} onExpired={onExpired} />)
    audio.useAudioPlayerStatus.mockImplementation((player) => ({ playing: player.playing, error: player.source?.uri.endsWith('s=1') ? 'expired' : null }))

    await view.rerender(<VoiceNotePlayer source='https://s3/a.m4a?s=1' durationMs={3000} onExpired={onExpired} />)
    expect(onExpired).toHaveBeenCalledTimes(1)

    await view.rerender(<VoiceNotePlayer source='https://s3/a.m4a?s=2' durationMs={3000} onExpired={onExpired} />)
    await act(async () => {})
    expect(failing('https://s3/a.m4a?s=2').play).toHaveBeenCalledTimes(1)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it('si falla otra vez con la URL nueva no vuelve a pedir (un solo reintento)', async () => {
    const onExpired = jest.fn()
    audio.useAudioPlayerStatus.mockImplementation(() => ({ playing: false, error: 'boom' }))
    const view = await render(<VoiceNotePlayer source='https://s3/b.m4a?s=1' durationMs={3000} onExpired={onExpired} />)
    await view.rerender(<VoiceNotePlayer source='https://s3/b.m4a?s=2' durationMs={3000} onExpired={onExpired} />)

    expect(onExpired).toHaveBeenCalledTimes(1)
  })
})

describe('VoiceNotePlayer: modo de audio', () => {
  it('antes de reproducir deja la sesión en modo reproducción, que suena con el switch de silencio de iOS', async () => {
    audio.setAudioModeAsync.mockClear()
    const view = await render(<VoiceNotePlayer source='https://s3/c.m4a' durationMs={3000} />)
    const player = failing('https://s3/c.m4a')

    await act(async () => { fireEvent.press(view.getByLabelText(TEXTS.play)) })

    expect(audio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: false, playsInSilentMode: true })
    expect(player.play).toHaveBeenCalledTimes(1)
    expect(audio.setAudioModeAsync.mock.invocationCallOrder[0]).toBeLessThan(player.play.mock.invocationCallOrder[0])
  })
})
