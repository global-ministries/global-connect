import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { MisHijos } from '@/components/perfil/mis-hijos'
import { parseMisHijos } from '@/lib/platform/ninos/mis-hijos'

// RPC answers routed by function name (call order does not matter).
type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }
let respuestas: Record<string, Respuesta>
const rpc = jest.fn((fn: string) => Promise.resolve(respuestas[fn] ?? { data: null, error: { code: '500', message: 'sin mock' } }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-12',
}))

const CAMPUS = [
  { id: 'c1', nombre: 'Centro', principal: false },
  { id: 'c2', nombre: 'Este', principal: true },
]
const ana = {
  id: 'h9', nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', genero: 'Femenino', edad: 5,
  tiene_ficha: true, grado: null, alergias: null, necesidades_especiales: null, habitos: null, notas: null,
  puede_comer: null, cambio_panal: null, autoriza_imagen: null, escolarizado: null, autorizados: [],
  otros_padres: [], puede_editar_identidad: true,
}

beforeEach(() => {
  rpc.mockClear()
  respuestas = {
    ninos_mis_hijos_campus: { data: CAMPUS, error: null },
    ninos_mis_hijos: { data: [ana], error: null },
    ninos_mis_hijos_pendientes: { data: [], error: null },
  }
})

function llenarNino() {
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2021-03-04' } })
  fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Femenino' } })
}

async function abrirFormulario() {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar a mis hijos' }))
  return screen.findByRole('button', { name: 'Registrar' })
}

describe('MisHijos — register from home', () => {
  it('shows the section without children, with the entry to add them', () => {
    render(<MisHijos hijos={[]} />)
    expect(screen.getByRole('heading', { name: 'Mis hijos' })).toBeInTheDocument()
    expect(screen.getByText(/Aún no tienes hijos registrados en Niños/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar a mis hijos' })).toBeInTheDocument()
    expect(screen.queryAllByTestId('mi-hijo')).toHaveLength(0)
  })

  it('registers a child on the principal campus, never sending a room, and lists them right away', async () => {
    respuestas.ninos_mis_hijos_registrar = {
      data: { registrados: [{ id: 'h9', nombre: 'Ana', apellido: 'Pérez' }], pendientes: [] },
      error: null,
    }
    render(<MisHijos hijos={[]} />)
    await abrirFormulario()
    await waitFor(() => expect(screen.getByLabelText('Campus')).toHaveValue('c2'))
    expect(screen.queryByLabelText('Nivel')).not.toBeInTheDocument()
    llenarNino()
    fireEvent.change(screen.getByLabelText('Alergias'), { target: { value: 'Maní' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('Registramos a Ana. Ya pueden entrar el domingo.')).toBeInTheDocument()
    const llamada = rpc.mock.calls.find(([fn]) => fn === 'ninos_mis_hijos_registrar') as unknown as [string, { p: Record<string, unknown> }]
    expect(llamada[1].p).toMatchObject({
      campus_id: 'c2',
      hijos: [expect.objectContaining({ nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', alergias: 'Maní' })],
      autorizados: [],
    })
    expect((llamada[1].p.hijos as Record<string, unknown>[])[0]).not.toHaveProperty('salon_preferido_id')
    expect(llamada[1].p).not.toHaveProperty('padre')
    await waitFor(() => expect(screen.getAllByTestId('mi-hijo')[0]).toHaveTextContent('Ana Pérez'))
  })

  it('a likely duplicate stays pending of confirmation at the table', async () => {
    respuestas.ninos_mis_hijos_registrar = { data: { registrados: [], pendientes: [{ nombre: 'Ana', apellido: 'Pérez' }] }, error: null }
    respuestas.ninos_mis_hijos = { data: [], error: null }
    respuestas.ninos_mis_hijos_pendientes = { data: [{ nombre: 'Ana', apellido: 'Pérez', created_at: '2026-10-12T10:00:00Z' }], error: null }
    render(<MisHijos hijos={[]} />)
    await abrirFormulario()
    llenarNino()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText(/Ana quedó pendiente de confirmar en la mesa/)).toBeInTheDocument()
    const pendientes = await screen.findByRole('list', { name: 'Pendientes de confirmar' })
    expect(within(pendientes).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(pendientes).getByText('Pendiente de confirmar en la mesa')).toBeInTheDocument()
  })

  it('shows the pending requests read on the server', () => {
    render(<MisHijos hijos={parseMisHijos([ana])} pendientes={[{ nombre: 'Luis', apellido: 'Pérez' }]} />)
    const pendientes = screen.getByRole('list', { name: 'Pendientes de confirmar' })
    expect(within(pendientes).getByText('Luis Pérez')).toBeInTheDocument()
  })

  it('maps an RPC error to a friendly message and keeps the form open', async () => {
    respuestas.ninos_mis_hijos_registrar = { data: null, error: { code: '23505', message: 'hijo_ya_registrado' } }
    render(<MisHijos hijos={[]} />)
    await abrirFormulario()
    llenarNino()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('Uno de los niños ya está entre tus hijos o pendiente de confirmar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument()
  })

  it('validates before calling the RPC', async () => {
    render(<MisHijos hijos={[]} />)
    await abrirFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(rpc.mock.calls.some(([fn]) => fn === 'ninos_mis_hijos_registrar')).toBe(false)
  })

  it('says so when the campus list cannot be read', async () => {
    respuestas.ninos_mis_hijos_campus = { data: null, error: { code: '500', message: 'fetch failed' } }
    render(<MisHijos hijos={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a mis hijos' }))
    expect(await screen.findByText('No pudimos cargar los campus. Cierra y vuelve a intentar.')).toBeInTheDocument()
  })
})
