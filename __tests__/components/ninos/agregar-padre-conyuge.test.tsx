import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgregarPadreForm } from '@/components/ninos/agregar-padre-form'
import type { FamiliaEncontrada, HijoEncontrado } from '@/lib/platform/ninos/familias-vista'

type Respuesta = { data: unknown; error: { message: string; code?: string } | null }

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

/** Routes the rpc mock by function name, so the on-open spouse lookup never shifts other answers. */
function responder(respuestas: Record<string, Respuesta | (() => Promise<Respuesta>)>) {
  rpc.mockImplementation((fn: string) => {
    const r = respuestas[fn]
    if (typeof r === 'function') return r()
    return Promise.resolve(r ?? { data: null, error: null })
  })
}

beforeEach(() => rpc.mockReset())

function hijo(h: Partial<HijoEncontrado> & { id: string; nombre: string }): HijoEncontrado {
  return {
    apellido: 'Pérez', fecha_nacimiento: '2021-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true,
    autorizados: [], ...h,
  }
}

const familia: FamiliaEncontrada = {
  id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null,
  hijos: [hijo({ id: 'h1', nombre: 'Luis' }), hijo({ id: 'h2', nombre: 'Eva' })],
  padres: [{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234' }],
}

const conyuge = { id: 'p2', nombre: 'Juan', apellido: 'Pérez', genero: 'Masculino' }

describe('AgregarPadreForm — spouse suggestion', () => {
  it('suggests the spouse and links it with the checked children on one explicit click', async () => {
    responder({
      ninos_conyuge_de: { data: conyuge, error: null },
      ninos_vincular_padre: { data: { padre_id: 'p2', padre_nuevo: false, vinculados: 1 }, error: null },
    })
    const onVinculado = jest.fn()
    render(<AgregarPadreForm familia={familia} onVinculado={onVinculado} onCancelar={jest.fn()} />)

    expect(await screen.findByText('Juan Pérez — cónyuge de Ana')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p1' })
    expect(rpc).not.toHaveBeenCalledWith('ninos_vincular_padre', expect.anything())

    fireEvent.click(screen.getByLabelText('Eva Pérez'))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, es su padre' }))

    await waitFor(() => expect(onVinculado).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('ninos_vincular_padre', { p_nino_ids: ['h1'], p_padre_id: 'p2', p_padre_nuevo: null })
  })

  it('genders the button by the spouse and falls back to "padre/madre"', async () => {
    responder({ ninos_conyuge_de: { data: { ...conyuge, nombre: 'Marta', genero: null }, error: null } })
    render(<AgregarPadreForm familia={familia} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    expect(await screen.findByRole('button', { name: 'Sí, es su padre/madre' })).toBeInTheDocument()
  })

  it('"No, buscar otra persona" hides the suggestion and keeps the search', async () => {
    responder({
      ninos_conyuge_de: { data: { ...conyuge, genero: 'Femenino' }, error: null },
      ninos_buscar_padre: {
        data: [{ id: 'p3', nombre: 'Rosa', apellido: 'Gil', telefono: '•••9876', cedula: null, coincide_por: 'telefono' }],
        error: null,
      },
    })
    render(<AgregarPadreForm familia={familia} onVinculado={jest.fn()} onCancelar={jest.fn()} />)

    expect(await screen.findByRole('button', { name: 'Sí, es su madre' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No, buscar otra persona' }))
    expect(screen.queryByText('Juan Pérez — cónyuge de Ana')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Teléfono de la persona'), { target: { value: '0414 555 9876' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar persona' }))
    expect(await screen.findByRole('button', { name: 'Sí, es esta persona' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Persona nueva' })).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith('ninos_vincular_padre', expect.anything())
  })

  it('shows no suggestion when the adult has no spouse', async () => {
    responder({ ninos_conyuge_de: { data: null, error: null } })
    render(<AgregarPadreForm familia={familia} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p1' }))
    expect(screen.queryByText(/cónyuge de/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar persona' })).toBeInTheDocument()
  })

  it('shows no suggestion when the lookup fails', async () => {
    responder({ ninos_conyuge_de: () => Promise.reject(new Error('red')) })
    render(<AgregarPadreForm familia={familia} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p1' }))
    expect(screen.queryByText(/cónyuge de/)).not.toBeInTheDocument()
  })

  it('shows no suggestion when the spouse is already a parent of the family', async () => {
    responder({ ninos_conyuge_de: { data: conyuge, error: null } })
    const conAmbos: FamiliaEncontrada = {
      ...familia,
      padres: [...familia.padres, { id: 'p2', nombre: 'Juan', apellido: 'Pérez', telefono: null }],
    }
    render(<AgregarPadreForm familia={conAmbos} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p1' }))
    expect(screen.queryByText(/cónyuge de/)).not.toBeInTheDocument()
  })
})
