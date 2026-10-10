import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { EditarNinoForm } from '@/components/ninos/editar-nino-form'
import type { HijoEncontrado } from '@/lib/platform/ninos/familias-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: jest.fn(),
}))

// The Caracas date the form must validate against (never the UTC date of the machine).
const hoy = jest.mocked(hoyEnCaracas)

beforeEach(() => {
  rpc.mockReset()
  hoy.mockReturnValue('2026-10-10')
})

const SALA = 'f9a10000-0000-4000-9a06-000000000001'

const hijo: HijoEncontrado = {
  id: 'h1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2021-05-05', genero: 'Masculino', grado: null,
  alergias: 'Maní', necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, salon_preferido_id: SALA, es_vip_desde: null, tiene_ficha: true,
  autorizados: [{ id: 'a1', nombre: 'Abuela', telefono: null, relacion: 'Abuela' }],
}

const PERMITIDAS = [
  'alergias', 'autoriza_imagen', 'autorizados', 'cambio_panal', 'escolarizado', 'grado', 'habitos',
  'necesidades_especiales', 'notas', 'puede_comer',
]

describe('EditarNinoForm — parent mode', () => {
  it('saves through guardar with the parent payload only (never the room) and no staff RPC', async () => {
    const guardar = jest.fn().mockResolvedValue(null)
    const onGuardado = jest.fn()
    render(<EditarNinoForm hijo={hijo} modo="padre" guardar={guardar} onGuardado={onGuardado} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Alergias'), { target: { value: 'Maní y huevo' } })
    fireEvent.change(screen.getByLabelText('Grado escolar del niño 1'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    const payload = guardar.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual([...PERMITIDAS, 'apellido', 'fecha_nacimiento', 'genero', 'nombre'].sort())
    expect(payload).toMatchObject({ alergias: 'Maní y huevo', grado: 1, nombre: 'Luis', autorizados: [{ nombre: 'Abuela', telefono: null, relacion: 'Abuela' }] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('a child with an own account: no identity fields and no identity keys', async () => {
    const guardar = jest.fn().mockResolvedValue(null)
    render(
      <EditarNinoForm hijo={{ ...hijo, genero: 'Otro' }} modo="padre" identidadEditable={false} guardar={guardar} onGuardado={jest.fn()} onCancelar={jest.fn()} />,
    )
    expect(screen.queryByLabelText('Nombre del niño 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(guardar).toHaveBeenCalled())
    expect(Object.keys(guardar.mock.calls[0][0]).sort()).toEqual(PERMITIDAS)
  })

  it('shows the error returned by guardar and stays open', async () => {
    const guardar = jest.fn().mockResolvedValue({ error: 'Hay un dato que no puedes cambiar desde aquí.' })
    const onGuardado = jest.fn()
    render(<EditarNinoForm hijo={hijo} modo="padre" guardar={guardar} onGuardado={onGuardado} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hay un dato que no puedes cambiar desde aquí.')
    expect(onGuardado).not.toHaveBeenCalled()
  })

  it('stops at 6 pickup people', () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, nombre: `Persona ${i}`, telefono: null, relacion: null }))
    render(<EditarNinoForm hijo={{ ...hijo, autorizados: seis }} modo="padre" guardar={jest.fn()} onGuardado={jest.fn()} onCancelar={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Agregar persona autorizada' })).not.toBeInTheDocument()
    expect(screen.getByText('Máximo 6 personas.')).toBeInTheDocument()
  })

  it('a child without ficha must be under 13 before saving', async () => {
    const guardar = jest.fn()
    render(
      <EditarNinoForm hijo={{ ...hijo, tiene_ficha: false }} modo="padre" guardar={guardar} onGuardado={jest.fn()} onCancelar={jest.fn()} />,
    )
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2010-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Solo se registran en Niños los menores de 13 años')
    expect(guardar).not.toHaveBeenCalled()
  })
})

describe('EditarNinoForm — team mode with guardar', () => {
  it('passes the full team payload (room included) to guardar instead of the RPC', async () => {
    const guardar = jest.fn().mockResolvedValue(null)
    render(<EditarNinoForm hijo={hijo} guardar={guardar} onGuardado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }))

    await waitFor(() => expect(guardar).toHaveBeenCalled())
    expect(guardar.mock.calls[0][0]).toMatchObject({ salon_preferido_id: SALA, nombre: 'Luis' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('EditarNinoForm — parent mode uses the Caracas date', () => {
  it('refuses a birth date after today in Caracas even if it is already past elsewhere', async () => {
    // Caracas is still on 2020-01-01; the machine clock is years later.
    hoy.mockReturnValue('2020-01-01')
    const guardar = jest.fn()
    render(<EditarNinoForm hijo={{ ...hijo, fecha_nacimiento: '2019-05-05' }} modo="padre" guardar={guardar} onGuardado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2020-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de nacimiento no es válida.')
    expect(guardar).not.toHaveBeenCalled()
  })
})
