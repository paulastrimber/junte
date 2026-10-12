import { LoadingState } from '../components/LoadingState.jsx'

export const TEXTS = Object.freeze({ loading: 'Cargando…' })

/** Mientras se lee la sesión guardada en el teléfono. */
export default function LoadingScreen () {
  return <LoadingState label={TEXTS.loading} fill />
}
