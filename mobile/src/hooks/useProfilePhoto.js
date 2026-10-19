import { useState } from 'react'

import { pickProfileImage } from '../services/imagePicker.js'
import { uploadProfilePhoto } from '../services/photoUpload.js'
import { toViewError } from '../utils/errorMessages.js'
import { useAuth } from './useAuth.js'

/**
 * Elegir una foto, subirla (presign → S3 → confirmar) y actualizar el perfil.
 * @returns {{ isUploading: boolean, error: import('../utils/errorMessages.js').ViewError | null, choosePhoto: () => Promise<void> }}
 */
export function useProfilePhoto () {
  const { setUser } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)

  async function choosePhoto () {
    if (isUploading) return
    setError(null)
    try {
      const asset = await pickProfileImage()
      if (!asset) return // canceló: no es un error
      setIsUploading(true)
      setUser(await uploadProfilePhoto(asset))
    } catch (failure) {
      setError(toViewError(failure))
    } finally {
      setIsUploading(false)
    }
  }

  return { isUploading, error, choosePhoto }
}
