/**
 * N2b (odd/tasks/ninos-v2.md, S4; prototype 05) — the desk by keyboard:
 * "/" focuses the search (not while typing or with a panel open), Enter in
 * the search opens the family pre-checked with focus on "Registrar ingreso",
 * the code moves focus to "Siguiente familia", which returns to the search,
 * and Esc closes the panel.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'
import type { HijoEncontrado, SalonFila } from '@/lib/platform/ninos/familias-vista'

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
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
]
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const servicio = { turnoId: 't9', fecha: '2026-10-11' }

const luis: HijoEncontrado = {
  id: 'h1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-06-01', genero: 'Masculino', grado: null, alergias: null,
  necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null,
  escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true, autorizados: [],
}
const familia = { id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null, hijos: [luis] }

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const BUSCAR = 'Buscar familia por teléfono o nombre'

beforeEach(() => {
  rpc.mockReset()
  rpc.mockImplementation((nombre: string) =>
    Promise.resolve(nombre === 'ninos_buscar_familias' ? { data: [familia], error: null } : { data: null, error: null }),
  )
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ filas: [{ nino_id: 'h1', salon_id: 's1', codigo: '4821', ocupacion: 4, capacidad: 20, sobre_capacidad: false }] }),
  })
})

async function abrirFamiliaConEnter() {
  const buscar = screen.getByLabelText(BUSCAR)
  fireEvent.change(buscar, { target: { value: 'Pérez' } })
  fireEvent.submit(screen.getByRole('search'))
  return screen.findByRole('button', { name: 'Registrar ingreso · 1 niño' })
}

describe('Check-in by keyboard', () => {
  it('"/" focuses the search and announces the shortcut', () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const buscar = screen.getByLabelText(BUSCAR)
    expect(buscar).toHaveAttribute('aria-keyshortcuts', '/')
    fireEvent.keyDown(document.body, { key: '/' })
    expect(buscar).toHaveFocus()
  })

  it('"/" does nothing while typing in another field or with a modifier', () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const fecha = screen.getByLabelText('Fecha')
    fecha.focus()
    fireEvent.keyDown(fecha, { key: '/' })
    expect(fecha).toHaveFocus()
    fireEvent.keyDown(document.body, { key: '/', metaKey: true })
    expect(screen.getByLabelText(BUSCAR)).not.toHaveFocus()
  })

  it('"/" does nothing with a panel open, and Esc closes the panel', async () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nueva familia' }))
    const panel = await screen.findByRole('dialog', { name: 'Nueva familia' })
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByLabelText(BUSCAR)).not.toHaveFocus()
    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Enter in the search opens the family pre-checked with focus on "Registrar ingreso"', async () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const registrar = await abrirFamiliaConEnter()
    expect(screen.getByRole('checkbox', { name: 'Luis Pérez' })).toBeChecked()
    await waitFor(() => expect(registrar).toHaveFocus())
  })

  it('after the code focus goes to "Siguiente familia", and from there back to the search', async () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.click(await abrirFamiliaConEnter())
    const codigo = await screen.findByRole('region', { name: 'Ingreso registrado' })
    const siguiente = within(codigo).getByRole('button', { name: 'Siguiente familia' })
    await waitFor(() => expect(siguiente).toHaveFocus())
    fireEvent.click(siguiente)
    await waitFor(() => expect(screen.getByLabelText(BUSCAR)).toHaveFocus())
    expect(screen.getByLabelText(BUSCAR)).toHaveValue('')
  })

  it('shows the key hints (desktop only, hidden from screen readers)', async () => {
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const atajos = screen.getByText('registrar familia marcada').closest('p')
    expect(atajos).toHaveAttribute('aria-hidden', 'true')
    expect(atajos).toHaveClass('hidden', 'lg:flex')
    await abrirFamiliaConEnter()
    expect(screen.getByText('registra a los niños marcados').closest('p')).toHaveClass('hidden', 'lg:flex')
  })
})
