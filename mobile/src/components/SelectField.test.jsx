import { fireEvent, render, screen } from '@testing-library/react-native'

import { SelectField } from './SelectField.jsx'

const OPTIONS = [
  { key: 'um', label: 'Universidad de Montevideo (UM)' },
  { key: 'ort', label: 'Universidad ORT Uruguay (ORT)' }
]
const MANY = Array.from({ length: 10 }, (_, i) => ({ key: `carrera-${i}`, label: `Ingeniería en Sistemas ${i}`, group: i % 2 ? 'Facultad A' : 'Facultad B' }))

async function renderField (props = {}) {
  const onChange = jest.fn()
  const view = await render(<SelectField label='Universidad' value='' options={OPTIONS} onChange={onChange} {...props} />)
  return { ...view, onChange }
}

const openList = () => fireEvent.press(screen.getByRole('button', { name: 'Universidad' }))

describe('SelectField', () => {
  it('sin valor muestra "Elegir"; con valor, su texto; "other" se muestra como Otra', async () => {
    await renderField()
    expect(screen.getByText('Elegir')).toBeOnTheScreen()

    await renderField({ value: 'ort' })
    expect(screen.getByText('Universidad ORT Uruguay (ORT)')).toBeOnTheScreen()

    await renderField({ value: 'other' })
    expect(screen.getByText('Otra')).toBeOnTheScreen()
  })

  it('al tocar abre la lista con las opciones y "Otra" al final', async () => {
    await renderField()

    await openList()

    expect(screen.getByRole('button', { name: 'Universidad de Montevideo (UM)' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Universidad ORT Uruguay (ORT)' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Otra' })).toBeOnTheScreen()
  })

  it('elegir una opción llama a onChange con su key y cierra la lista', async () => {
    const { onChange } = await renderField()
    await openList()

    await fireEvent.press(screen.getByRole('button', { name: 'Universidad ORT Uruguay (ORT)' }))

    expect(onChange).toHaveBeenCalledWith('ort')
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeOnTheScreen()
  })

  it('elegir "Otra" manda la key reservada other', async () => {
    const { onChange } = await renderField()
    await openList()

    await fireEvent.press(screen.getByRole('button', { name: 'Otra' }))

    expect(onChange).toHaveBeenCalledWith('other')
  })

  it('elegir lo que ya estaba elegido no dispara onChange', async () => {
    const { onChange } = await renderField({ value: 'um' })
    await openList()

    await fireEvent.press(screen.getByRole('button', { name: 'Universidad de Montevideo (UM)' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('cerrar sin elegir no cambia nada', async () => {
    const { onChange } = await renderField()
    await openList()

    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('con pocas opciones no hay buscador; con muchas sí, y filtra sin importar tildes ni mayúsculas', async () => {
    await renderField()
    await openList()
    expect(screen.queryByLabelText('Buscar universidad')).not.toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }))

    await renderField({ options: MANY })
    await openList()
    await fireEvent.changeText(screen.getByLabelText('Buscar universidad'), 'INGENIERIA EN SISTEMAS 7')

    expect(screen.getByRole('button', { name: 'Ingeniería en Sistemas 7' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Ingeniería en Sistemas 3' })).not.toBeOnTheScreen()
  })

  it('la búsqueda también mira el grupo (facultad) y "Otra" no se filtra', async () => {
    await renderField({ options: MANY })
    await openList()

    await fireEvent.changeText(screen.getByLabelText('Buscar universidad'), 'facultad a')

    expect(screen.getByRole('button', { name: 'Ingeniería en Sistemas 1' })).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Ingeniería en Sistemas 0' })).not.toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Otra' })).toBeOnTheScreen()
  })

  it('sin coincidencias avisa', async () => {
    await renderField({ options: MANY })
    await openList()

    await fireEvent.changeText(screen.getByLabelText('Buscar universidad'), 'zzzz')

    expect(screen.getByText('No encontramos coincidencias.')).toBeOnTheScreen()
  })

  it('muestra el grupo (facultad) de cada opción', async () => {
    await renderField({ options: MANY })
    await openList()

    expect(screen.getAllByText('Facultad A').length).toBeGreaterThan(0)
  })

  it('con allowOther=false no ofrece "Otra"', async () => {
    await renderField({ allowOther: false })
    await openList()

    expect(screen.queryByRole('button', { name: 'Otra' })).not.toBeOnTheScreen()
  })

  it('deshabilitado no abre la lista y muestra la pista', async () => {
    await renderField({ disabled: true, hint: 'Elegí primero una universidad.' })

    expect(screen.getByRole('button', { name: 'Universidad' })).toBeDisabled()
    expect(screen.getByText('Elegí primero una universidad.')).toBeOnTheScreen()
  })

  it('muestra el error', async () => {
    await renderField({ error: 'La universidad elegida no existe' })

    expect(screen.getByText('La universidad elegida no existe')).toBeOnTheScreen()
  })
})
