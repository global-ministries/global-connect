/**
 * /dps/matriz (RSC, odd/tasks/dps-asistencia-pco.md, T12): the 8 Sundays from
 * `?desde=` (else the Sunday of today), their plans (dps_planes_rango) and
 * each plan's teams (dps_plan_equipos: the first one alone, so the director
 * puestos sync once, then the rest in parallel). Whoever does not see DPS
 * gets a 404; a failed plan read keeps the others. The client island is
 * mocked to read its props.
 */
import React from 'react'
import { render } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({ isDreamTeamEnabled: () => isDreamTeamEnabled() }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-07' }))

const getUser = jest.fn()
type Respuesta = { data: unknown; error: unknown }
let respuestas: Record<string, Respuesta | ((args: Record<string, unknown>) => Respuesta)> = {}
const rpc = jest.fn(async (nombre: string, args: Record<string, unknown>) => {
  const r = respuestas[nombre]
  return (typeof r === 'function' ? r(args) : r) ?? { data: null, error: null }
})
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dps/matriz-client', () => ({
  MatrizClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsMatrizPage, { metadata } from '@/app/(auth)/dps/matriz/page'

const plan = (id: string, fecha: string, parche: Record<string, unknown> = {}) => ({
  id,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: 1,
  serie: null,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  ...parche,
})
const PLANES = [plan('p1', '2026-11-01'), plan('cena', '2026-11-03', { tipo: 'cena_del_senor' }), plan('p8', '2026-11-08')]
const equipos = (planId: string, puedeEditar = true) => ({ plan_id: planId, puede_editar: puedeEditar, equipos: [] })

const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>
const pagina = async (query: Record<string, string> = {}) => render(await DpsMatrizPage({ searchParams: Promise.resolve(query) }))

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  respuestas = {
    dps_planes_rango: { data: PLANES, error: null },
    dps_plan_equipos: ({ p_plan_id }) => ({ data: equipos(String(p_plan_id)), error: null }),
  }
})

describe('/dps/matriz', () => {
  it('reads the 8 weeks from the Sunday of today and the teams of every plan', async () => {
    await pagina()
    expect(metadata).toEqual({ title: 'Matriz — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-11-01', p_hasta: '2026-12-26' })
    const llamadas = rpc.mock.calls.filter(([n]) => n === 'dps_plan_equipos').map(([, a]) => a)
    expect(llamadas).toEqual([{ p_plan_id: 'p1' }, { p_plan_id: 'cena' }, { p_plan_id: 'p8' }])
    const props = ultima()
    expect(props.hoy).toBe('2026-11-07')
    expect((props.rango as { desde: string }).desde).toBe('2026-11-01')
    expect((props.planes as { id: string }[]).map((p) => p.id)).toEqual(['p1', 'cena', 'p8'])
    expect(Object.keys(props.equipos as object)).toEqual(['p1', 'cena', 'p8'])
    expect(props.editable).toBe(true)
    expect(props.error).toBeNull()
  })

  it('takes ?desde= as the Sunday of that week', async () => {
    await pagina({ desde: '2026-12-30' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-12-27', p_hasta: '2027-02-20' })
  })

  it('is read-only when the database says the caller does not plan', async () => {
    respuestas.dps_plan_equipos = ({ p_plan_id }) => ({ data: equipos(String(p_plan_id), false), error: null })
    await pagina()
    expect(ultima().editable).toBe(false)
  })

  it('keeps the other plans when one cannot be read, and says so', async () => {
    respuestas.dps_plan_equipos = ({ p_plan_id }) =>
      p_plan_id === 'cena' ? { data: null, error: { message: 'boom' } } : { data: equipos(String(p_plan_id)), error: null }
    await pagina()
    expect(Object.keys(ultima().equipos as object)).toEqual(['p1', 'p8'])
    expect(ultima().error).toBe('No se pudo cargar 1 fecha. Actualiza la página.')
  })

  it('has no plans to read in an empty range', async () => {
    respuestas.dps_planes_rango = { data: [], error: null }
    await pagina()
    expect(rpc.mock.calls.some(([n]) => n === 'dps_plan_equipos')).toBe(false)
    expect(ultima().planes).toEqual([])
    expect(ultima().editable).toBe(false)
  })

  it('says when the range cannot be read', async () => {
    respuestas.dps_planes_rango = { data: null, error: { message: 'boom' } }
    await pagina()
    expect(ultima().error).toBe('No se pudo cargar el plan. Actualiza la página.')
  })

  it('is not found for whoever does not see DPS, nor when Dream Team is off', async () => {
    respuestas.dps_planes_rango = { data: null, error: { message: 'sin_autoridad', code: '42501' } }
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a visitor without a session to log in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(pagina()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
