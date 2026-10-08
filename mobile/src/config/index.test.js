import Constants from 'expo-constants'

import { getConfig } from './index.js'

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))

describe('getConfig', () => {
  afterEach(() => {
    Constants.expoConfig = { extra: {} }
  })

  it('lee apiUrl y appEnv de extra', () => {
    Constants.expoConfig = { extra: { apiUrl: 'http://10.0.2.2:8080/api/v1', appEnv: 'development' } }

    expect(getConfig()).toEqual({ apiUrl: 'http://10.0.2.2:8080/api/v1', appEnv: 'development' })
  })

  it('falla con un mensaje claro si falta apiUrl', () => {
    expect(() => getConfig()).toThrow(/EXPO_PUBLIC_API_URL/)
  })
})
