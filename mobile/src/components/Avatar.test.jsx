import { fireEvent, render, screen } from '@testing-library/react-native'

import { Avatar } from './Avatar.jsx'

const signed = (file, signature) => `https://bucket.s3.amazonaws.com/users/u1/${file}?X-Amz-Signature=${signature}`
const uriOf = () => screen.getByRole('image', { name: 'Foto de perfil' }).props.source.uri

describe('Avatar', () => {
  it('sin foto muestra la inicial', async () => {
    await render(<Avatar name='ana' />)

    expect(screen.getByRole('image', { name: 'Sin foto de perfil' })).toBeOnTheScreen()
    expect(screen.getByText('A')).toBeOnTheScreen()
  })

  it('si solo cambia la firma de la URL sigue usando la que ya cargó (no la vuelve a descargar)', async () => {
    const { rerender } = await render(<Avatar photoUrl={signed('a.jpg', 'uno')} />)

    await rerender(<Avatar photoUrl={signed('a.jpg', 'dos')} />)

    expect(uriOf()).toBe(signed('a.jpg', 'uno'))
  })

  it('con otra foto, o si la carga anterior falló, pasa a la URL nueva', async () => {
    const { rerender } = await render(<Avatar photoUrl={signed('a.jpg', 'uno')} />)

    await rerender(<Avatar photoUrl={signed('b.jpg', 'uno')} />)
    expect(uriOf()).toBe(signed('b.jpg', 'uno'))

    await fireEvent(screen.getByRole('image', { name: 'Foto de perfil' }), 'error')
    await rerender(<Avatar photoUrl={signed('b.jpg', 'dos')} />)
    expect(uriOf()).toBe(signed('b.jpg', 'dos'))
  })
})
