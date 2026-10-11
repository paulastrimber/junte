import * as ImagePicker from 'expo-image-picker'

import { pickProfileImage } from './imagePicker.js'

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }))

describe('pickProfileImage', () => {
  it('abre la galería solo con imágenes, recorte cuadrado y compresión', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })

    await pickProfileImage()

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8
    })
  })

  it('devuelve null si la persona cancela', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null })

    expect(await pickProfileImage()).toBeNull()
  })

  it('devuelve el archivo elegido', async () => {
    const asset = { uri: 'file:///cache/a.jpg', mimeType: 'image/jpeg', fileSize: 1000 }
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] })

    expect(await pickProfileImage()).toBe(asset)
  })
})
