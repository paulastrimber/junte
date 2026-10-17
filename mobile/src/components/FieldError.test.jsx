import { fireEvent, render, screen } from '@testing-library/react-native'

import { EmptyState } from './EmptyState.jsx'
import { ErrorBanner } from './ErrorBanner.jsx'
import { FieldError } from './FieldError.jsx'
import { FormField } from './FormField.jsx'
import { LoadingState } from './LoadingState.jsx'

describe('FieldError', () => {
  it('muestra el error como alerta', async () => {
    await render(<FieldError message='Elegí al menos un tipo de actividad.' />)

    expect(screen.getByRole('alert')).toHaveTextContent('Elegí al menos un tipo de actividad.')
  })

  it.each([[undefined], [null], ['']])('sin mensaje (%p) no pinta nada', async (message) => {
    await render(<FieldError message={message} />)

    expect(screen.toJSON()).toBeNull()
  })
})

describe('FormField', () => {
  it('el campo se nombra con su etiqueta y muestra la ayuda mientras no haya error', async () => {
    await render(<FormField label='Título' hint='Lo ven quienes miran el plan.' value='' onChangeText={jest.fn()} />)

    expect(screen.getByLabelText('Título')).toBeOnTheScreen()
    expect(screen.getByText('Lo ven quienes miran el plan.')).toBeOnTheScreen()
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen()
  })

  it('con error muestra el error (como alerta) en lugar de la ayuda', async () => {
    await render(<FormField label='Título' hint='Lo ven quienes miran el plan.' error='El título necesita al menos 3 caracteres.' value='' onChangeText={jest.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('El título necesita al menos 3 caracteres.')
    expect(screen.queryByText('Lo ven quienes miran el plan.')).not.toBeOnTheScreen()
  })

  it('avisa el foco y la salida del campo a quien lo usa', async () => {
    const onFocus = jest.fn()
    const onBlur = jest.fn()
    await render(<FormField label='Email' value='' onChangeText={jest.fn()} onFocus={onFocus} onBlur={onBlur} />)

    await fireEvent(screen.getByLabelText('Email'), 'focus', {})
    await fireEvent(screen.getByLabelText('Email'), 'blur', {})

    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  // BUG-QA-5: al enfocar un campo con error, el lector de pantalla lee solo la etiqueta (y la ayuda): el error queda
  // en otro elemento y no se asocia al campo. Lo esperable es que el error sea parte de lo que se anuncia del campo.
  it.failing('el error forma parte de lo que el lector anuncia al enfocar el campo', async () => {
    await render(<FormField label='Título' error='El título necesita al menos 3 caracteres.' value='' onChangeText={jest.fn()} />)

    const input = screen.getByLabelText(/Título/)
    const announced = `${input.props.accessibilityLabel ?? ''} ${input.props.accessibilityHint ?? ''}`
    expect(announced).toContain('El título necesita al menos 3 caracteres.')
  })
})

describe('ErrorBanner', () => {
  it('muestra el título y el mensaje del ViewError', async () => {
    await render(<ErrorBanner title='No pudimos actualizar los planes.' error={{ code: 'NETWORK_ERROR', message: 'Revisá tu conexión.', requestId: null }} />)

    expect(screen.getByText('No pudimos actualizar los planes.')).toBeOnTheScreen()
    expect(screen.getByText('Revisá tu conexión.')).toBeOnTheScreen()
  })

  // BUG-QA-6: el banner pone `accessibilityRole='alert'` en una View que no es un elemento accesible (sin
  // `accessible` ni `accessibilityLiveRegion`): el lector no lo trata como alerta y un error que aparece solo (un
  // refresco fallido, "cargar más") no se anuncia. Lo esperable: un elemento accesible con rol alerta y su texto.
  it.failing('se anuncia como alerta con el título y el mensaje', async () => {
    await render(<ErrorBanner title='No pudimos actualizar los planes.' error={{ code: 'NETWORK_ERROR', message: 'Revisá tu conexión.', requestId: null }} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos actualizar los planes\..*Revisá tu conexión\./)
  })

  it('sin error ni mensaje no pinta nada', async () => {
    await render(<ErrorBanner error={null} title='No se ve' />)

    expect(screen.toJSON()).toBeNull()
  })
})

describe('EmptyState y LoadingState', () => {
  it('el vacío tiene título como encabezado y solo muestra la acción si hay qué hacer', async () => {
    const onAction = jest.fn()
    await render(<EmptyState title='No hay planes para mostrar' message='Probá con menos filtros.' actionTitle='Crear un plan' onAction={onAction} />)

    expect(screen.getByRole('header', { name: 'No hay planes para mostrar' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Crear un plan' })).toBeOnTheScreen()

    await screen.rerender(<EmptyState title='No hay planes para mostrar' actionTitle='Crear un plan' />)
    expect(screen.queryByRole('button')).not.toBeOnTheScreen()
  })

  it('cargando anuncia qué se espera', async () => {
    await render(<LoadingState label='Cargando el plan…' />)

    expect(screen.getByLabelText('Cargando el plan…')).toBeOnTheScreen()
    expect(screen.getByText('Cargando el plan…')).toBeOnTheScreen()
  })
})
