/**
 * T2e (odd/tasks/ninos-checkin-pco.md, S9.2 "Solo coordinación/dirección de
 * Niños"): the «Custodia» section of the ficha in Familias — only for who may
 * edit restrictions; add, edit, deactivate; the RPC HINT as is.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SeccionCustodia } from '@/components/ninos/custodia/seccion-custodia'
import { FamiliasClient } from '@/components/ninos/familias-client'
import type { RestriccionFicha } from '@/lib/platform/ninos/custodia'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc, from: jest.fn() }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/lib/actions/ninos-custodia.actions', () => ({ listarCustodia: jest.fn(), guardarCustodia: jest.fn() }))

const acciones = jest.requireMock('@/lib/actions/ninos-custodia.actions') as { listarCustodia: jest.Mock; guardarCustodia: jest.Mock }

const N1 = '11111111-1111-4111-8111-111111111111'
const R1 = '33333333-3333-4333-8333-333333333333'
const carlos: RestriccionFicha = {
  id: R1, persona: 'Carlos Pérez', relacion: 'Papá', respaldo: 'orden judicial del 3/5/2026', notas: 'Mantener en el salón.', activa: true, actualizadaAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  rpc.mockReset()
})

describe('SeccionCustodia', () => {
  it('lists the restrictions with their state, relation and protocol', async () => {
    acciones.listarCustodia.mockResolvedValue({ ok: true, data: [carlos, { ...carlos, id: 'r2', persona: 'Ana Gil', activa: false, relacion: null, notas: null }] })
    render(<SeccionCustodia ninoId={N1} nombre="Sofía" />)
    const lista = await screen.findByRole('list', { name: 'Restricciones de custodia' })
    expect(within(lista).getByText('No entregar a Carlos Pérez — orden judicial del 3/5/2026')).toBeInTheDocument()
    expect(within(lista).getByText('Relación: Papá · En la puerta: Mantener en el salón.')).toBeInTheDocument()
    expect(within(lista).getByText('Activa')).toBeInTheDocument()
    expect(within(lista).getByText('Inactiva')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activar de nuevo la restricción de Ana Gil' })).toBeInTheDocument()
    expect(acciones.listarCustodia).toHaveBeenCalledWith(N1)
  })

  it('adds a restriction: checks the form first, then saves and reloads', async () => {
    acciones.listarCustodia.mockResolvedValueOnce({ ok: true, data: [] }).mockResolvedValueOnce({ ok: true, data: [carlos] })
    acciones.guardarCustodia.mockResolvedValue({ ok: true, data: { id: R1 } })
    render(<SeccionCustodia ninoId={N1} nombre="Sofía" />)
    expect(await screen.findByText('Sin restricciones de custodia.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar restricción' }))
    fireEvent.change(screen.getByLabelText('Persona que no puede retirar'), { target: { value: 'Carlos Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar restricción' }))
    expect(await screen.findByText('Indica el respaldo de la restricción (por ejemplo, la orden judicial), hasta 300 caracteres.')).toBeInTheDocument()
    expect(acciones.guardarCustodia).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Respaldo'), { target: { value: 'orden judicial del 3/5/2026' } })
    fireEvent.change(screen.getByLabelText('Qué hacer en la puerta (opcional)'), { target: { value: 'Mantener en el salón.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar restricción' }))
    await waitFor(() =>
      expect(acciones.guardarCustodia).toHaveBeenCalledWith({
        id: null, ninoId: N1, persona: 'Carlos Pérez', relacion: '', respaldo: 'orden judicial del 3/5/2026', notas: 'Mantener en el salón.', activa: true,
      }),
    )
    expect(await screen.findByText('Restricción guardada: no entregar a Carlos Pérez.')).toBeInTheDocument()
    expect(screen.getByText('No entregar a Carlos Pérez — orden judicial del 3/5/2026')).toBeInTheDocument()
    expect(screen.queryByLabelText('Persona que no puede retirar')).not.toBeInTheDocument()
  })

  it('deactivates a restriction with the same data', async () => {
    acciones.listarCustodia.mockResolvedValueOnce({ ok: true, data: [carlos] }).mockResolvedValueOnce({ ok: true, data: [{ ...carlos, activa: false }] })
    acciones.guardarCustodia.mockResolvedValue({ ok: true, data: { id: R1 } })
    render(<SeccionCustodia ninoId={N1} nombre="Sofía" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar la restricción de Carlos Pérez' }))
    await waitFor(() =>
      expect(acciones.guardarCustodia).toHaveBeenCalledWith({
        id: R1, ninoId: N1, persona: 'Carlos Pérez', relacion: 'Papá', respaldo: 'orden judicial del 3/5/2026', notas: 'Mantener en el salón.', activa: false,
      }),
    )
    expect(await screen.findByText('Restricción desactivada: Carlos Pérez ya no se bloquea.')).toBeInTheDocument()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
  })

  it('edits a restriction and shows the refusal HINT as is', async () => {
    acciones.listarCustodia.mockResolvedValue({ ok: true, data: [carlos] })
    acciones.guardarCustodia.mockResolvedValue({ ok: false, message: 'Esta persona ya tiene una restricción activa para este niño.' })
    render(<SeccionCustodia ninoId={N1} nombre="Sofía" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Editar la restricción de Carlos Pérez' }))
    expect(screen.getByLabelText('Persona que no puede retirar')).toHaveValue('Carlos Pérez')
    fireEvent.change(screen.getByLabelText('Respaldo'), { target: { value: 'Medida de protección' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar restricción' }))
    expect(await screen.findByText('Esta persona ya tiene una restricción activa para este niño.')).toBeInTheDocument()
    expect(acciones.guardarCustodia).toHaveBeenCalledWith(expect.objectContaining({ id: R1, respaldo: 'Medida de protección', activa: true }))
  })

  it('shows the HINT when the list is refused, and no add button', async () => {
    acciones.listarCustodia.mockResolvedValue({ ok: false, message: 'Solo coordinación o dirección de Niños puede ver las restricciones de custodia de la ficha.' })
    render(<SeccionCustodia ninoId={N1} nombre="Sofía" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo coordinación o dirección de Niños puede ver las restricciones de custodia de la ficha.')
    expect(screen.queryByRole('button', { name: 'Agregar restricción' })).not.toBeInTheDocument()
  })
})

describe('Familias — the ficha panel', () => {
  const familia = {
    id: 'p1', nombre: 'María', apellido: 'Rodríguez', telefono: '0414', cedula: null, padres: [{ id: 'p1', nombre: 'María', apellido: 'Rodríguez', telefono: '0414' }],
    hijos: [{
      id: N1, nombre: 'Sofía', apellido: 'Rodríguez', fecha_nacimiento: '2022-03-10', genero: 'Femenino', grado: null, alergias: null,
      necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null, escolarizado: null,
      salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [],
    }],
  }

  async function abrirFicha(puedeEditarCustodia?: boolean) {
    rpc.mockResolvedValue({ data: [familia], error: null })
    acciones.listarCustodia.mockResolvedValue({ ok: true, data: [carlos] })
    render(<FamiliasClient salones={[]} fechaServicio="2026-11-08" puedeEditarCustodia={puedeEditarCustodia} />)
    fireEvent.change(screen.getByLabelText('Buscar familia'), { target: { value: 'María' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    return screen.findByRole('dialog')
  }

  it('coordination sees the «Custodia» section in the ficha', async () => {
    const panel = await abrirFicha(true)
    expect(await within(panel).findByRole('heading', { name: 'Custodia' })).toBeInTheDocument()
    expect(await within(panel).findByText('No entregar a Carlos Pérez — orden judicial del 3/5/2026')).toBeInTheDocument()
    expect(acciones.listarCustodia).toHaveBeenCalledWith(N1)
  })

  it('anyone else sees nothing there and nothing is asked', async () => {
    const panel = await abrirFicha()
    expect(within(panel).getByRole('button', { name: 'Guardar ficha' })).toBeInTheDocument()
    expect(within(panel).queryByRole('heading', { name: 'Custodia' })).not.toBeInTheDocument()
    expect(acciones.listarCustodia).not.toHaveBeenCalled()
  })
})
