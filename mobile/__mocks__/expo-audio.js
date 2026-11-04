// Mock de expo-audio para jest: el módulo nativo no existe en los tests. Graba y reproduce "en el aire": cada test
// puede leer el grabador y el reproductor que se crearon (`__recorders`, `__players`) y configurar lo que necesita.
const recorders = []
const players = []

function createRecorder () {
  const recorder = {
    uri: null,
    isRecording: false,
    currentTime: 0,
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(() => { recorder.isRecording = true }),
    stop: jest.fn(async () => {
      recorder.isRecording = false
      recorder.uri = 'file:///tmp/nota.m4a'
    }),
    getStatus: jest.fn(() => ({ isRecording: recorder.isRecording, durationMillis: recorder.currentTime * 1000 }))
  }
  recorders.push(recorder)
  return recorder
}

function createPlayer (source) {
  const player = { source, playing: false, play: jest.fn(() => { player.playing = true }), pause: jest.fn(() => { player.playing = false }), seekTo: jest.fn(async () => {}), remove: jest.fn() }
  players.push(player)
  return player
}

module.exports = {
  __recorders: recorders,
  __players: players,
  AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: jest.fn(() => {
    const React = require('react')
    const ref = React.useRef(null)
    ref.current ??= createRecorder()
    return ref.current
  }),
  useAudioRecorderState: jest.fn((recorder) => ({ isRecording: recorder.isRecording, durationMillis: recorder.currentTime * 1000 })),
  useAudioPlayer: jest.fn((source) => {
    const React = require('react')
    const ref = React.useRef(null)
    ref.current ??= createPlayer(source)
    return ref.current
  }),
  useAudioPlayerStatus: jest.fn((player) => ({ playing: player.playing, currentTime: 0, duration: 0, didJustFinish: false }))
}
