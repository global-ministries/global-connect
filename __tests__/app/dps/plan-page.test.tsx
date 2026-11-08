/**
 * /dps/plan (RSC, odd/tasks/dps-asistencia-pco.md, T10): without ?plan= the
 * next plan from today (else the most recent one), with ?plan=<id> that plan
 * (dps_plan_leer); its neighbours for the date pill (dps_planes_rango around
 * its date), its teams (dps_plan_equipos) and its cover URL. No plans, an
 * invalid ?plan= and a failed teams read have their own states; whoever does
 * not see DPS gets a 404. The client island is mocked to read its props.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({ isDreamTeamEnabled: () => isDreamTeamEnabled() }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-04' }))

const getUser = jest.fn()
type Respuesta = { data: unknown; error: unknown }
let respuestas: Record<string, Respuesta | ((args: Record<string, unknown>) => Respuesta)> = {}
const rpc = jest.fn(async (nombre: string, args: Record<string, unknown>) => {
  const r = respuestas[nombre]
  return (typeof r === 'function' ? r(args) : r) ?? { data: null, error: null }
})
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dps/plan-client', () => ({
  PlanClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsPlanPage, { metadata } from '@/app/(auth)/dps/plan/page'

const ID = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`
const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: 's1/1.png', semanas: 4 }
const plan = (n: number, fecha: string, parche: Record<string, unknown> = {}) => ({
  id: ID(n),
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: n,
  serie: SERIE,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  ...parche,
})
const PLANES = [plan(1, '2026-11-01'), plan(2, '2026-11-08'), plan(3, '2026-11-15')]
const EQUIPOS = { plan_id: ID(2), puede_editar: true, equipos: [] }

const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>
const pagina = async (query: Record<string, string> = {}) => render(await DpsPlanPage({ searchParams: Promise.resolve(query) }))

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.supabase.co'
  respuestas = {
    dps_planes_rango: ({ p_desde }) => ({ data: p_desde === '2026-11-04' ? PLANES.slice(1) : PLANES, error: null }),
    dps_plan_equipos: { data: EQUIPOS, error: null },
    dps_plan_leer: { data: { ...PLANES[0], puede_editar: true }, error: null },
  }
})

describe('/dps/plan', () => {
  it('opens the next plan from today with its neighbours, teams and cover', async () => {
    await pagina()
    expect(metadata).toEqual({ title: 'Plan — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-11-04', p_hasta: '2027-11-04' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-07-11', p_hasta: '2027-03-08' })
    expect(rpc).toHaveBeenCalledWith('dps_plan_equipos', { p_plan_id: ID(2) })
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(ultima()).toMatchObject({
      plan: { id: ID(2), fecha: '2026-11-08' },
      anterior: { id: ID(1) },
      siguiente: { id: ID(3) },
      equipos: { planId: ID(2), puedeEditar: true },
      portadaUrl: 'https://demo.supabase.co/storage/v1/object/public/dps-series/s1/1.png',
      motivo: null,
      error: null,
    })
  })

  it('opens the plan of ?plan=', async () => {
    await pagina({ plan: ID(1) })
    expect(rpc).toHaveBeenCalledWith('dps_plan_leer', { p_plan_id: ID(1) })
    expect(rpc).toHaveBeenCalledWith('dps_plan_equipos', { p_plan_id: ID(1) })
    expect(ultima()).toMatchObject({ plan: { id: ID(1) }, anterior: null, siguiente: { id: ID(2) } })
  })

  it('says the plan does not exist for a malformed or unknown ?plan=', async () => {
    await pagina({ plan: 'no-es-un-id' })
    expect(rpc).not.toHaveBeenCalledWith('dps_plan_leer', expect.anything())
    expect(ultima()).toMatchObject({ plan: null, equipos: null, motivo: 'plan_invalido' })
    respuestas.dps_plan_leer = { data: null, error: { code: '22023', message: 'plan_invalido' } }
    await pagina({ plan: ID(9) })
    expect(ultima()).toMatchObject({ plan: null, equipos: null, motivo: 'plan_invalido' })
    expect(rpc).not.toHaveBeenCalledWith('dps_plan_equipos', expect.anything())
  })

  it('falls back to the most recent plan when none is ahead, and to the empty state when there are none', async () => {
    respuestas.dps_planes_rango = ({ p_desde }) => ({ data: p_desde === '2026-11-04' ? [] : PLANES.slice(0, 2), error: null })
    await pagina()
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2025-11-04', p_hasta: '2026-11-03' })
    expect(ultima()).toMatchObject({ plan: { id: ID(2) } })

    respuestas.dps_planes_rango = { data: [], error: null }
    rpc.mockClear()
    await pagina()
    expect(ultima()).toMatchObject({ plan: null, equipos: null, motivo: 'sin_planes', error: null })
    expect(rpc).not.toHaveBeenCalledWith('dps_plan_equipos', expect.anything())
  })

  it('shows the plan with an error when its teams cannot be read', async () => {
    respuestas.dps_plan_equipos = { data: null, error: { code: 'XX000', message: 'boom' } }
    await pagina()
    expect(ultima()).toMatchObject({ plan: { id: ID(2) }, equipos: null, error: 'No se pudo cargar el plan. Actualiza la página.' })
  })

  it('has no cover URL without an image', async () => {
    respuestas.dps_plan_leer = { data: { ...plan(1, '2026-11-01', { serie: { ...SERIE, imagen_path: null } }), puede_editar: true }, error: null }
    await pagina({ plan: ID(1) })
    expect(ultima()).toMatchObject({ portadaUrl: null })
  })

  it('is a 404 for someone who does not see DPS, or with Dream Team off; asks to sign in without a session', async () => {
    respuestas.dps_planes_rango = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    respuestas.dps_plan_leer = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(pagina({ plan: ID(1) })).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(true)
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(pagina()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
