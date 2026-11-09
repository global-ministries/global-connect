/**
 * T2a (odd/tasks/ninos-checkin-pco.md, S6 "pickup per child", artboard
 * design/ninos-checkin-pco/07-retiro-celular.html): the code searches by
 * itself, the anfitrión marks which children leave and who picks up, the
 * success says who is still inside, and «Últimos retiros» lists the service.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RetiroPanel } from '@/components/ninos/retiro-panel'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const N1 = '11111111-1111-4111-8111-111111111111'
const N2 = '22222222-2222-4222-8222-222222222222'
const N3 = '33333333-3333-4333-8333-333333333333'
const servicio = { turnoId: 't9', fecha: '2026-11-08' }

const fila = (over: Record<string, unknown>) => ({
  checkin_id: 'c1', nino_id: N1, nombre: 'Sofía', apellido: 'Rodríguez', salon_id: 's1', salon: 'Preescolar II',
  entrada_at: '2026-11-08T12:58:00Z', salida_at: null, retirado_por_nombre: null, autorizados: [], ...over,
})
const sofia = fila({})
const mateo = fila({ checkin_id: 'c2', nino_id: N2, nombre: 'Mateo', salon_id: 's2', salon: 'UpStreet 3º' })
const lucas = fila({
  checkin_id: 'c3', nino_id: N3, nombre: 'Lucas', salon: 'Preescolar II',
  salida_at: '2026-11-08T14:40:00Z', retirado_por_nombre: 'Carmen Escalona',
})
const opciones = [
  { nombre: 'María Rodríguez', telefono: '04145550000', relacion: 'Representante', tipo: 'representante' },
  { nombre: 'Carmen Escalona', telefono: null, relacion: 'Abuela', tipo: 'autorizado' },
]
const recientes = {
  adentro: 98, salieron: 31,
  retiros: [{ nino_id: 'x1', nombre: 'Isabella', apellido: 'Mendoza', salon: 'UpStreet 1º', salida_at: '2026-11-08T14:49:00Z',
    retirado_por_nombre: 'Carlos Mendoza', otra_persona: false }],
}

/** The RPC answers by name; ninos_buscar_codigo answers `codigo` in order (before / after the pickup). */
function responder(codigo: unknown[][], checkout: { filas?: unknown[]; error?: { code: string; message?: string } } = {}) {
  const lecturas = [...codigo]
  rpc.mockReset()
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_buscar_codigo') return Promise.resolve({ data: lecturas.length > 1 ? lecturas.shift() : lecturas[0], error: null })
    if (nombre === 'ninos_retiro_opciones') return Promise.resolve({ data: opciones, error: null })
    if (nombre === 'ninos_retiros_recientes') return Promise.resolve({ data: recientes, error: null })
    return Promise.resolve({ data: null, error: null })
  })
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: !checkout.error,
    status: checkout.error ? 422 : 200,
    json: async () => (checkout.error ? { error: checkout.error } : { filas: checkout.filas ?? [] }),
  })
}

const cuerpoEnviado = () => JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
const escribir = (v: string) => fireEvent.change(screen.getByLabelText('Código de seguridad'), { target: { value: v } })

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
})

describe('RetiroPanel — the code', () => {
  it('searches by itself at the 4th digit, without a «Buscar» button', async () => {
    responder([[sofia]])
    render(<RetiroPanel servicio={servicio} />)
    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument()
    escribir('482')
    expect(screen.getByText('Escribe el código de la etiqueta del adulto. Busca solo al 4.º dígito.')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalledWith('ninos_buscar_codigo', expect.anything())
    escribir('4821')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_buscar_codigo', { p_codigo: '4821', p_turno_id: 't9', p_fecha: '2026-11-08' }),
    )
    expect(await screen.findByRole('checkbox', { name: /Sofía Rodríguez/ })).toBeInTheDocument()
  })

  it('a wrong code says so', async () => {
    responder([[]])
    render(<RetiroPanel servicio={servicio} />)
    escribir('9999')
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay niños con el código 9999 en este servicio.')
  })
})

describe('RetiroPanel — pickup per child', () => {
  it('marks one child of two, narrows who may pick up, and sends only that child', async () => {
    const despues = [fila({ salida_at: '2026-11-08T14:52:00Z', retirado_por_nombre: 'María Rodríguez' }), mateo]
    responder([[sofia, mateo, lucas], despues], { filas: [{ nino_id: N1, salon_id: 's1', salida_at: '2026-11-08T14:52:00Z' }] })
    const onRetirado = jest.fn()
    render(<RetiroPanel servicio={servicio} onRetirado={onRetirado} />)
    escribir('4827')

    const ninos = await screen.findByRole('group', { name: '¿A quién retiras?' })
    const cajaSofia = within(ninos).getByRole('checkbox', { name: /Sofía Rodríguez/ })
    expect(cajaSofia).not.toBeChecked()
    expect(within(ninos).getByRole('checkbox', { name: /Mateo Rodríguez/ })).not.toBeChecked()
    // A child already out is not a checkbox and says when and with whom.
    expect(within(ninos).queryByRole('checkbox', { name: /Lucas/ })).not.toBeInTheDocument()
    expect(within(ninos).getByText('Salió 10:40 con Carmen Escalona')).toBeInTheDocument()
    // Nothing marked yet: the options are those of the whole code, as before.
    expect(rpc).toHaveBeenCalledWith('ninos_retiro_opciones', { p_codigo: '4827', p_turno_id: 't9', p_fecha: '2026-11-08' })

    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Marca al menos un niño.')
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(cajaSofia)
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_retiro_opciones', { p_codigo: '4827', p_turno_id: 't9', p_fecha: '2026-11-08', p_nino_ids: [N1] }),
    )
    fireEvent.click(await screen.findByRole('radio', { name: /María Rodríguez/ }))
    expect(screen.getByText('Mateo sigue en UpStreet 3º')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Sofía · con María' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ninos/checkout')
    expect(cuerpoEnviado()).toEqual({
      codigo: '4827', turnoId: 't9', fecha: '2026-11-08', retiradoPor: 'María Rodríguez', motivoOtra: null, ninoIds: [N1],
    })
    const hecho = await screen.findByRole('status')
    expect(hecho).toHaveTextContent('Retirado por María Rodríguez · 10:52')
    expect(hecho).toHaveTextContent('Sofía salió de Preescolar II.')
    const sigue = screen.getByRole('list', { name: 'Sigue adentro' })
    expect(within(sigue).getByText('Mateo Rodríguez').closest('li')).toHaveTextContent('Sigue en UpStreet 3º · desde 08:58')
    expect(onRetirado).toHaveBeenCalledTimes(1)

    // The sibling leaves later with the same code.
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Mateo también' }))
    expect(await screen.findByRole('checkbox', { name: /Mateo Rodríguez/ })).toBeChecked()
    expect(screen.getByText('Salió 10:52 con María Rodríguez')).toBeInTheDocument()
  })

  it('«Siguiente código» clears the code', async () => {
    responder([[sofia], [fila({ salida_at: '2026-11-08T14:52:00Z', retirado_por_nombre: 'María Rodríguez' })]], {
      filas: [{ nino_id: N1, salon_id: 's1', salida_at: '2026-11-08T14:52:00Z' }],
    })
    render(<RetiroPanel servicio={servicio} />)
    escribir('4821')
    fireEvent.click(await screen.findByRole('radio', { name: /María Rodríguez/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Sofía · con María' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Retirado por María Rodríguez · 10:52')
    expect(screen.queryByRole('list', { name: 'Sigue adentro' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente código' }))
    expect(screen.getByLabelText('Código de seguridad')).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('a child who already left at another door is explained', async () => {
    responder([[sofia, mateo]], { error: { code: '22023', message: 'nino_no_esta_adentro' } })
    render(<RetiroPanel servicio={servicio} />)
    escribir('4827')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Mateo Rodríguez/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Carmen Escalona/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Mateo · con Carmen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Uno de los niños marcados ya salió o no tiene este código. Revisa la lista.')
  })
})

describe('RetiroPanel — as before (no child list)', () => {
  it('the only child inside starts marked; options and the pickup go without a list', async () => {
    responder([[sofia]], { filas: [{ nino_id: N1, salon_id: 's1', salida_at: '2026-11-08T14:52:00Z' }] })
    render(<RetiroPanel servicio={servicio} />)
    escribir('4821')
    expect(await screen.findByRole('checkbox', { name: /Sofía Rodríguez/ })).toBeChecked()
    expect(rpc).toHaveBeenCalledWith('ninos_retiro_opciones', { p_codigo: '4821', p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect(rpc).not.toHaveBeenCalledWith('ninos_retiro_opciones', expect.objectContaining({ p_nino_ids: expect.anything() }))
    fireEvent.click(await screen.findByRole('radio', { name: /María Rodríguez/ }))
    expect(screen.getByText('Salen todos los niños de este código')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Sofía · con María' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(cuerpoEnviado()).toEqual({ codigo: '4821', turnoId: 't9', fecha: '2026-11-08', retiradoPor: 'María Rodríguez', motivoOtra: null })
  })

  it('every child marked sends no list either', async () => {
    responder([[sofia, mateo]], { filas: [] })
    render(<RetiroPanel servicio={servicio} />)
    escribir('4827')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Sofía Rodríguez/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Mateo Rodríguez/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Carmen Escalona/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirar a Sofía y Mateo · con Carmen' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(cuerpoEnviado()).not.toHaveProperty('ninoIds')
  })
})

describe('RetiroPanel — Últimos retiros', () => {
  it('shows the service counts and the last pickups while no code is open', async () => {
    responder([[sofia]])
    render(<RetiroPanel servicio={servicio} />)
    const lista = await screen.findByRole('list', { name: 'Últimos retiros' })
    expect(rpc).toHaveBeenCalledWith('ninos_retiros_recientes', { p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect(screen.getByText(/niños adentro/)).toHaveTextContent('98 niños adentro · 31 ya salieron')
    expect(within(lista).getByText('Isabella Mendoza')).toBeInTheDocument()
    expect(within(lista).getByText('UpStreet 1º · con Carlos Mendoza')).toBeInTheDocument()
    expect(within(lista).getByText('10:49')).toBeInTheDocument()
    escribir('4821')
    await screen.findByRole('checkbox', { name: /Sofía Rodríguez/ })
    expect(screen.queryByRole('list', { name: 'Últimos retiros' })).not.toBeInTheDocument()
  })
})
