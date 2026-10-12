import { useState } from 'react'

import { LOCATION_STATUS, findAddress, getCurrentCoordinates } from '../services/location.js'

export const PLACE_MESSAGES = Object.freeze({
  notFound: 'No encontramos esa dirección. Probá con calle, número y ciudad, o mové el pin en el mapa.',
  denied: 'Sin permiso de ubicación no podemos usar tu posición. Buscá una dirección o mové el pin en el mapa.',
  unavailable: 'No pudimos obtener tu ubicación. Revisá que el GPS esté encendido.'
})

/**
 * Elegir el lugar de un plan: buscar una dirección (geocodificador del teléfono) o usar la ubicación actual.
 * El punto elegido se entrega con `onPick([lng, lat])`; después se ajusta arrastrando el pin del mapa.
 * @param {(coordinates: [number, number]) => void} onPick
 */
export function usePlacePicker (onPick) {
  const [address, setAddress] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [message, setMessage] = useState(null)

  async function run (find) {
    if (isWorking) return
    setIsWorking(true)
    setMessage(null)
    try {
      const { coordinates, failure } = await find()
      if (coordinates) onPick(coordinates)
      else setMessage(failure)
    } finally {
      setIsWorking(false)
    }
  }

  const searchAddress = () => run(async () => {
    if (address.trim() === '') return { coordinates: null, failure: null }
    const coordinates = await findAddress(address)
    return { coordinates, failure: PLACE_MESSAGES.notFound }
  })

  const pickMyLocation = () => run(async () => {
    const { status, coordinates } = await getCurrentCoordinates()
    return { coordinates, failure: status === LOCATION_STATUS.DENIED ? PLACE_MESSAGES.denied : PLACE_MESSAGES.unavailable }
  })

  return { address, setAddress, isWorking, message, searchAddress, pickMyLocation }
}
