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

  it('con firmas que cambian de lugar o de largo, la clave sigue siendo la ruta', async () => {
    const a = 'https://bucket.s3.amazonaws.com/users/u1/c.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=600&X-Amz-Signature=aaa'
    const b = 'https://bucket.s3.amazonaws.com/users/u1/c.jpg?X-Amz-Signature=bbbbbbbb&X-Amz-Expires=300&X-Amz-Algorithm=AWS4-HMAC-SHA256'
    const { rerender } = await render(<Avatar photoUrl={a} />)
    const first = sourceOf().cacheKey

    await rerender(<Avatar photoUrl={b} />)

    expect(sourceOf().cacheKey).toBe(first)
    expect(first).toBe('https://bucket.s3.amazonaws.com/users/u1/c.jpg')
  })

  it('otra foto (otra ruta) usa otra clave', async () => {
    const { rerender } = await render(<Avatar photoUrl={signed('a.jpg', 'uno')} />)
    const first = sourceOf().cacheKey

    await rerender(<Avatar photoUrl={signed('nueva.jpg', 'uno')} />)

    expect(sourceOf().cacheKey).not.toBe(first)
  })

  it('decorativa: el lector de pantalla no la ve, con foto ni con la inicial', async () => {
    const { rerender } = await render(<Avatar name='Ana' photoUrl={signed('a.jpg', 'uno')} decorative />)
    expect(screen.queryByRole('image')).not.toBeOnTheScreen()
    expect(screen.queryByLabelText(/foto de perfil/i)).not.toBeOnTheScreen()

    await rerender(<Avatar name='Ana' decorative />)
    expect(screen.queryByRole('image')).not.toBeOnTheScreen()
    expect(screen.queryByText('A')).not.toBeOnTheScreen()
    // Sigue dibujada para quien ve la pantalla.
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy()
  })

  it('decorativa y con error de carga: la inicial también queda oculta al lector', async () => {
    await render(<Avatar name='Ana' photoUrl={signed('a.jpg', 'uno')} decorative />)
    // Decorativa no tiene rol ni nombre: se busca la vista de expo-image por sus props.
    const image = screen.container.queryAll((node) => typeof node.props.onError === 'function' && node.props.source != null)[0]

    await fireEvent(image, 'error', { nativeEvent: { error: 'HTTP 403' } })

    expect(screen.queryByText('A')).not.toBeOnTheScreen()
    expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy()
  })

  it('clearPhotoCache vacía memoria y disco y no rechaza aunque el caché falle', async () => {
    jest.spyOn(Image, 'clearMemoryCache').mockResolvedValue(true)
    jest.spyOn(Image, 'clearDiskCache').mockRejectedValue(new Error('disco'))

    await expect(clearPhotoCache()).resolves.toBeUndefined()

    expect(Image.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(Image.clearDiskCache).toHaveBeenCalledTimes(1)
  })
})
