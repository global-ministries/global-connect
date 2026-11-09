/**
 * T2e (odd/tasks/ninos-checkin-pco.md, S9.2): custody restrictions show as an
 * alert at the desk (artboard 05: «Custodia» chip in the family and the
 * queue), the salón (06: Custodia icon in the list and the child sheet) and
 * the pickup (07: the red banner with the protocol and «Avisa a
 * coordinación»; the server refusal HINT as is). Not on the label (T3).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CheckinClient } from '@/components/ninos/checkin-client'
import { RetiroPanel } from '@/components/ninos/retiro-panel'
import { SalonClient } from '@/components/ninos/salon-client'
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
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const N1 = '11111111-1111-4111-8111-111111111111'
const N2 = '22222222-2222-4222-8222-222222222222'
const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const servicio = { turnoId: 't9', fecha: '2026-11-08' }
const HINT = 'Esta persona tiene una restricción de custodia: no puede retirar a este niño. Llama a coordinación.'

const restriccion = {
  nino_id: N1, persona_nombre: 'Carlos Pérez', relacion: 'Papá', respaldo: 'orden judicial', notas: 'Mantén a la niña en el salón.',
}

const nino = (id: string, nombre: string) => ({
  id, nombre, apellido: 'Rodríguez', fecha_nacimiento: '2025-06-01', genero: 'Femenino', tiene_ficha: true, grado: null,
  alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, desde_casa: false, autorizados: [],
})

const llamadas = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre)

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
})

describe('desk (artboard 05)', () => {
  const salones: SalonFila[] = [
    { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
  ]

  function responder() {
    rpc.mockImplementation((nombre: string, args: { p_nino_ids?: string[] }) => {
      if (nombre === 'ninos_prechecks_pendientes')
        return Promise.resolve({ data: [{ padre: { id: 'p1', nombre: 'María', apellido: 'Rodríguez' }, avisado_at: '2026-11-08T12:40:00Z', hijos: [nino(N1, 'Sofía')] }], error: null })
      if (nombre === 'ninos_buscar_familias')
        return Promise.resolve({ data: [{ id: 'p2', nombre: 'Ana', apellido: 'Rodríguez', telefono: '0414', cedula: null, hijos: [nino(N1, 'Sofía'), nino(N2, 'Mateo')] }], error: null })
      if (nombre === 'ninos_custodia_de')
        return Promise.resolve({ data: (args.p_nino_ids ?? []).includes(N1) ? [restriccion] : [], error: null })
      return Promise.resolve({ data: null, error: null })
    })
  }

  it('the queue row of a child with a restriction shows «Custodia»; tapping it says who not to hand over to', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    const fila = await screen.findByTestId('llegando-p1')
    const chip = await within(fila).findByRole('button', { name: 'Custodia: No entregar a Carlos Pérez — orden judicial' })
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    expect(chip).toHaveAttribute('title', 'No entregar a Carlos Pérez — orden judicial')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    expect(within(fila).getByText('No entregar a Carlos Pérez — orden judicial')).toBeInTheDocument()
  })

  it('the family at the mesa: only the child with the restriction has the chip', async () => {
    responder()
    render(<CheckinClient salones={salones} turnos={turnos} servicio={servicio} />)
    fireEvent.change(screen.getByLabelText('Buscar familia por teléfono o nombre'), { target: { value: 'Rodríguez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByRole('heading', { name: 'Ana Rodríguez' })
    expect(await within(screen.getByTestId(`nino-${N1}`)).findByRole('button', { name: /^Custodia:/ })).toBeInTheDocument()
    expect(within(screen.getByTestId(`nino-${N2}`)).queryByRole('button', { name: /^Custodia:/ })).not.toBeInTheDocument()
    await waitFor(() => expect(llamadas('ninos_custodia_de').some(([, a]) => a.p_nino_ids.includes(N2))).toBe(true))
  })
})

describe('salón (artboard 06)', () => {
  const lista = [
    { nino_id: N1, nombre: 'Sofía', apellido: 'Rodríguez', fecha_nacimiento: '2023-04-01', grado: null, codigo: '4821', entrada_at: '2026-11-08T12:58:00Z',
      alergias: null, necesidades_especiales: null, habitos: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null },
    { nino_id: N2, nombre: 'Mateo', apellido: 'Rodríguez', fecha_nacimiento: '2023-04-01', grado: null, codigo: '4821', entrada_at: '2026-11-08T12:58:00Z',
      alergias: null, necesidades_especiales: null, habitos: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null },
  ]
  const estado = { salon_id: 's1', puede_operar: false, puede_llegar: true, esperados: [], retirados: [], movimientos: [], destinos: [] }

  it('the list marks the child with the Custodia icon and the sheet shows the same text', async () => {
    rpc.mockImplementation((nombre: string) => {
      if (nombre === 'ninos_lista_salon') return Promise.resolve({ data: lista, error: null })
      if (nombre === 'ninos_salon_estado') return Promise.resolve({ data: estado, error: null })
      if (nombre === 'ninos_custodia_de') return Promise.resolve({ data: [restriccion], error: null })
      return Promise.resolve({ data: [], error: null })
    })
    render(<SalonClient salones={[{ id: 's1', nombre: 'Sala A' }]} turnos={turnos} servicio={servicio} salonId="s1" puedeOperar={false} />)
    const tarjeta = await screen.findByTestId(`fila-${N1}`)
    expect(await within(tarjeta).findByRole('button', { name: 'Custodia: No entregar a Carlos Pérez — orden judicial' })).toBeInTheDocument()
    expect(within(screen.getByTestId(`fila-tabla-${N1}`)).getByRole('button', { name: /^Custodia:/ })).toBeInTheDocument()
    expect(within(screen.getByTestId(`fila-${N2}`)).queryByRole('button', { name: /^Custodia:/ })).not.toBeInTheDocument()
    expect(llamadas('ninos_custodia_de')[0][1]).toEqual({ p_nino_ids: [N1, N2] })

    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Abrir Sofía Rodríguez' }))
    const hoja = await screen.findByRole('dialog')
    const aviso = within(hoja).getByRole('alert', { name: 'Custodia' })
    expect(aviso).toHaveTextContent('No entregar a Carlos Pérez — orden judicial')
    expect(aviso).toHaveTextContent('Mantén a la niña en el salón.')
  })
})

describe('pickup (artboard 07)', () => {
  const fila = (over: Record<string, unknown>) => ({
    checkin_id: 'c1', nino_id: N1, nombre: 'Sofía', apellido: 'Rodríguez', salon_id: 's1', salon: 'Preescolar II',
    entrada_at: '2026-11-08T12:58:00Z', salida_at: null, retirado_por_nombre: null, autorizados: [], ...over,
  })
  const codigo = [fila({}), fila({ checkin_id: 'c2', nino_id: N2, nombre: 'Mateo' })]

  function responder(checkout: { status: number; json: unknown }) {
    rpc.mockImplementation((nombre: string) => {
      if (nombre === 'ninos_buscar_codigo') return Promise.resolve({ data: codigo, error: null })
      if (nombre === 'ninos_retiro_opciones')
        return Promise.resolve({ data: [{ nombre: 'María Rodríguez', telefono: null, relacion: 'Representante', tipo: 'representante' }], error: null })
      if (nombre === 'ninos_custodia_de') return Promise.resolve({ data: [restriccion], error: null })
      return Promise.resolve({ data: null, error: null })
    })
    fetchMock.mockResolvedValue({ ok: checkout.status === 200, status: checkout.status, json: async () => checkout.json })
  }

  it('a code with a restricted child shows the red banner with the protocol and «Avisa a coordinación»', async () => {
    responder({ status: 200, json: { filas: [] } })
    render(<RetiroPanel servicio={servicio} />)
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '4821' } })
    const aviso = await screen.findByRole('alert', { name: 'Custodia' })
    expect(aviso).toHaveTextContent('No entregar a Carlos Pérez — orden judicial')
    expect(aviso).toHaveTextContent('No puede retirar a Sofía.')
    expect(aviso).toHaveTextContent('Mantén a la niña en el salón.')
    expect(aviso).toHaveTextContent('Avisa a coordinación')
    expect(within(aviso).queryByRole('link')).not.toBeInTheDocument()
    expect(llamadas('ninos_custodia_de')[0][1]).toEqual({ p_nino_ids: [N1, N2] })
  })

  it('the server refusal shows its HINT as is', async () => {
    responder({ status: 403, json: { error: { code: '42501', message: 'custodia_restringida', hint: HINT } } })
    render(<RetiroPanel servicio={servicio} />)
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '4821' } })
    await screen.findByRole('alert', { name: 'Custodia' })
    fireEvent.click(screen.getByLabelText('Sofía Rodríguez', { exact: false }))
    fireEvent.click(screen.getByRole('radio', { name: 'Otra persona' }))
    fireEvent.change(screen.getByLabelText('Nombre de quien retira'), { target: { value: 'Carlos Pérez' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Dice que es el papá' } })
    fireEvent.click(screen.getByRole('button', { name: /^Retirar a Sofía/ }))
    expect(await screen.findByText(HINT)).toBeInTheDocument()
  })

  it('a code without restrictions shows no banner', async () => {
    rpc.mockImplementation((nombre: string) => {
      if (nombre === 'ninos_buscar_codigo') return Promise.resolve({ data: codigo, error: null })
      return Promise.resolve({ data: [], error: null })
    })
    render(<RetiroPanel servicio={servicio} />)
    fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: '4821' } })
    await screen.findByText('¿A quién retiras?')
    await waitFor(() => expect(llamadas('ninos_custodia_de')).toHaveLength(1))
    expect(screen.queryByRole('alert', { name: 'Custodia' })).not.toBeInTheDocument()
  })
})
