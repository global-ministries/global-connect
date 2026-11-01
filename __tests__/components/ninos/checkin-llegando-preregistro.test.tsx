/**
 * P4 (odd/tasks/ninos-precheck.md) — a family that pre-registered by QR and
 * said "¿Vienen hoy?" shows up in "Llegando"; the table opens its review,
 * which registers the family and selects it for the usual check-in.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
    from: () => {
      const chain = { select: () => chain, update: () => chain, eq: () => chain, in: () => Promise.resolve({ data: [], error: null }) }
      return chain
    },
  }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))
// PaginaSistema renders DesktopHeader behind React.lazy; a plain double keeps the providers out.
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
]
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const servicio = { turnoId: 't9', fecha: '2026-10-11' }

const entrada = {
  tipo: 'preregistro',
  preregistro_id: 'pr1',
  padre: { nombre: 'Rosa', apellido: 'Qr' },
  avisado_at: '2026-10-11T12:40:00Z',
  hijos: [{ nombre: 'Sol', apellido: 'Qr', alergias: 'maní', necesidades_especiales: null }],
}

const pendiente = {
  id: 'pr1',
  campus_id: 'c1',
  created_at: '2026-10-11T12:30:00Z',
  payload: {
    padre: { nombre: 'Rosa', apellido: 'Qr', telefono: '04145551234', email: null, cedula: null, genero: null },
    hijos: [{ nombre: 'Sol', apellido: 'Qr', fecha_nacimiento: '2025-06-01', genero: 'Femenino', grado: null }],
    autorizados: [],
  },
}

function responder(pendientes: unknown[]) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_prechecks_pendientes') return Promise.resolve({ data: [entrada], error: null })
    if (nombre === 'ninos_preregistros_pendientes') return Promise.resolve({ data: pendientes, error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

const llamadas = (n: string) => rpc.mock.calls.filter(([x]) => x === n)

beforeEach(() => rpc.mockReset())

describe('Llegando: a QR pre-registration', () => {
  it('lists it with its children and alerts, marked as a pre-registration', async () => {
    responder([pendiente])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const lista = await screen.findByRole('region', { name: 'Llegando' })
    const fila = await within(lista).findByTestId('llegando-pre-pr1')
    expect(fila).toHaveTextContent('Rosa Qr')
    expect(fila).toHaveTextContent('Sol Qr')
    expect(fila).toHaveTextContent('Alergias: maní')
    expect(fila).toHaveTextContent('Pre-registro QR')
    expect(within(lista).queryByRole('button', { name: /Llegaron/ })).not.toBeInTheDocument()
  })

  it('is not listed again under "Pre-registros por QR" while it is in Llegando', async () => {
    responder([pendiente, { ...pendiente, id: 'pr2', payload: { ...pendiente.payload, padre: { ...pendiente.payload.padre, nombre: 'Luz', apellido: 'Mar' } } }])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const seccion = await screen.findByRole('region', { name: 'Pre-registros por QR' })
    expect(await within(seccion).findByRole('button', { name: 'Revisar registro: Luz Mar' })).toBeInTheDocument()
    expect(within(seccion).queryByRole('button', { name: 'Revisar registro: Rosa Qr' })).not.toBeInTheDocument()
  })

  it('"Revisar registro" opens the pre-registration review', async () => {
    responder([pendiente])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar registro: Rosa Qr' }))
    expect(await screen.findByText('Revisar pre-registro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar familia' })).toBeInTheDocument()
  })

  it('reads the pending list again when the pre-registration arrived after it was loaded', async () => {
    responder([])
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const boton = await screen.findByRole('button', { name: 'Revisar registro: Rosa Qr' })
    await waitFor(() => expect(llamadas('ninos_preregistros_pendientes')).toHaveLength(1))
    responder([pendiente])
    fireEvent.click(boton)
    expect(await screen.findByText('Revisar pre-registro')).toBeInTheDocument()
    expect(llamadas('ninos_preregistros_pendientes')).toHaveLength(2)
  })
})
