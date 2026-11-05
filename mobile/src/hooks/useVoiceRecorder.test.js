import { act, renderHook } from '@testing-library/react-native'

import { deferred } from '../../tests/helpers/deferred.js'
import { RECORDER_STATUS, useVoiceRecorder } from './useVoiceRecorder.js'

const audio = require('expo-audio')

beforeEach(() => {
  audio.requestRecordingPermissionsAsync.mockReset().mockResolvedValue({ granted: true })
  audio.setAudioModeAsync.mockClear()
})

const recorderOf = () => audio.__recorders.at(-1)

describe('useVoiceRecorder', () => {
  it('un segundo start mientras se prepara no inicia otra grabación', async () => {
    const { result } = await renderHook(() => useVoiceRecorder())
    const permission = deferred()
    audio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise)

    let first
    await act(async () => { first = result.current.start() })
    expect(result.current.status).toBe(RECORDER_STATUS.STARTING)
    await act(async () => { await result.current.start() })
    permission.resolve({ granted: true })
    await act(async () => { await first })

    expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(recorderOf().prepareToRecordAsync).toHaveBeenCalledTimes(1)
    expect(recorderOf().record).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.cancel() })
  })

  it('si se desmonta mientras se prepara no graba y devuelve el modo de audio', async () => {
    const { result, unmount } = await renderHook(() => useVoiceRecorder())
    const permission = deferred()
    audio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise)
    let starting
    await act(async () => { starting = result.current.start() })

    await unmount()
    permission.resolve({ granted: true })
    await starting

    expect(recorderOf().record).not.toHaveBeenCalled()
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false })
  })

  it('al desmontar con una grabación abierta la descarta, restaura el modo de audio y tolera un stop que lanza', async () => {
    const { result, unmount } = await renderHook(() => useVoiceRecorder())
    await act(async () => { await result.current.start() })
    recorderOf().stop.mockImplementation(() => { throw new Error('sync boom') })
    audio.setAudioModeAsync.mockClear()

    await expect(unmount()).resolves.not.toThrow()

    expect(recorderOf().stop).toHaveBeenCalled()
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: false })
  })
})
