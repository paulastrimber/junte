import * as Location from 'expo-location'

import { LOCATION_STATUS, findAddress, getCurrentCoordinates, requestLocationPermission } from './location.js'

const granted = () => Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
const denied = () => Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })

describe('services/location', () => {
  describe('requestLocationPermission', () => {
    it('true con permiso, false si se niega', async () => {
      granted()
      expect(await requestLocationPermission()).toBe(true)

      denied()
      expect(await requestLocationPermission()).toBe(false)
    })

    it('si el sistema falla al pedirlo, se trata como sin permiso (no rechaza)', async () => {
      Location.requestForegroundPermissionsAsync.mockRejectedValue(new Error('boom'))

      expect(await requestLocationPermission()).toBe(false)
    })
  })

  describe('getCurrentCoordinates', () => {
    it('devuelve la posición como GeoJSON [lng, lat]', async () => {
      granted()
      Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -34.9011, longitude: -56.1645, accuracy: 12 } })

      expect(await getCurrentCoordinates()).toEqual({ status: LOCATION_STATUS.GRANTED, coordinates: [-56.1645, -34.9011] })
    })

    it('sin permiso → denied y no consulta el GPS', async () => {
      denied()

      expect(await getCurrentCoordinates()).toEqual({ status: LOCATION_STATUS.DENIED, coordinates: null })
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
    })

    it('con permiso pero sin posición (GPS apagado) → unavailable, sin rechazar', async () => {
      granted()
      Location.getCurrentPositionAsync.mockRejectedValue(new Error('Location services are disabled'))

      expect(await getCurrentCoordinates()).toEqual({ status: LOCATION_STATUS.UNAVAILABLE, coordinates: null })
    })
  })

  describe('findAddress', () => {
    it('devuelve [lng, lat] del primer resultado del geocodificador del teléfono', async () => {
      Location.geocodeAsync.mockResolvedValue([{ latitude: -34.913, longitude: -56.166 }, { latitude: 1, longitude: 2 }])

      expect(await findAddress('  Parque Rodó, Montevideo ')).toEqual([-56.166, -34.913])
      expect(Location.geocodeAsync).toHaveBeenCalledWith('Parque Rodó, Montevideo')
    })

    it('sin resultados, con el texto vacío o si el geocodificador falla → null', async () => {
      Location.geocodeAsync.mockResolvedValue([])
      expect(await findAddress('calle que no existe 123')).toBeNull()

      expect(await findAddress('   ')).toBeNull()

      Location.geocodeAsync.mockRejectedValue(new Error('sin red'))
      expect(await findAddress('18 de Julio 1234')).toBeNull()
    })
  })
})
