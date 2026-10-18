import { fireEvent, render, screen } from '@testing-library/react-native'
import { Image } from 'expo-image'

import { Avatar, clearPhotoCache } from './Avatar.jsx'

const signed = (file, signature) => `https://bucket.s3.amazonaws.com/users/u1/${file}?X-Amz-Signature=${signature}`
const photo = () => screen.getByRole('image', { name: 'Foto de perfil' })
// La vista nativa de expo-image recibe la fuente como lista.
const sourceOf = () => [].concat(photo().props.source)[0]

describe('Avatar', () => {
  it('sin foto muestra la inicial', async () => {
    await render(<Avatar name='ana' />)

    expect(screen.getByRole('image', { name: 'Sin foto de perfil' })).toBeOnTheScreen()
    expect(screen.getByText('A')).toBeOnTheScreen()
  })

  it('cachea por la URL sin firma: una firma nueva del mismo archivo usa la misma clave', async () => {
    const { rerender } = await render(<Avatar photoUrl={signed('a.jpg', 'uno')} />)
    expect(sourceOf()).toMatchObject({ uri: signed('a.jpg', 'uno'), cacheKey: 'https://bucket.s3.amazonaws.com/users/u1/a.jpg' })

    await rerender(<Avatar photoUrl={signed('a.jpg', 'dos')} />)

    expect(sourceOf()).toMatchObject({ uri: signed('a.jpg', 'dos'), cacheKey: 'https://bucket.s3.amazonaws.com/users/u1/a.jpg' })
  })

  it('si la carga falla muestra la inicial, y vuelve a probar cuando llega otra URL', async () => {
    const { rerender } = await render(<Avatar name='Beto' photoUrl={signed('b.jpg', 'uno')} />)

    await fireEvent(photo(), 'error', { nativeEvent: { error: 'HTTP 403' } })
    expect(screen.getByText('B')).toBeOnTheScreen()

    await rerender(<Avatar name='Beto' photoUrl={signed('b.jpg', 'dos')} />)
    expect(photo()).toBeOnTheScreen()
  })

  it('clearPhotoCache vacía memoria y disco y no rechaza aunque el caché falle', async () => {
    jest.spyOn(Image, 'clearMemoryCache').mockResolvedValue(true)
    jest.spyOn(Image, 'clearDiskCache').mockRejectedValue(new Error('disco'))

    await expect(clearPhotoCache()).resolves.toBeUndefined()

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1)
  })
})
