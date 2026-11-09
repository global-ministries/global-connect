/**
 * /dps/asistencia (RSC, odd/tasks/dps-asistencia-pco.md, T9): the
 * plans of the 14-day window (dps_planes_rango, which needs dps_puede_ver),
 * today's plan or the most recent one (?plan= picks another of the window),
 * and its sheet (dps_asistencia_planilla); a caller without teams gets the
 * "no teams" state. The client island is mocked to read its props.
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
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-08' }))

const getUser = jest.fn()
let respuestas: Record<string, { data: unknown; error: unknown }> = {}
const rpc = jest.fn(async (nombre: string) => respuestas[nombre] ?? { data: null, error: null })
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }) }))

const recibidas: unknown[] = []
jest.mock('@/components/dps/asistencia-client', () => ({
  AsistenciaClient: (props: unknown) => {
    recibidas.push(props)
    return <div data-testid="isla" />
  },
}))

import DpsAsistenciaPage, { metadata } from '@/app/(auth)/dps/asistencia/page'

const plan = (id: string, fecha: string) => ({ id, fecha, tipo: 'domingo', titulo: null, semana: 1, serie: null, horarios: ['09:15', '11:15'], llegada: '07:00' })
const PLANILLA = { plan_id: 'p2', fecha: '2026-11-08', tipo: 'domingo', hoy: '2026-11-08', editable: true, equipos: [] }

const ultima = () => recibidas[recibidas.length - 1] as Record<string, unknown>
const pagina = async (query: Record<string, string> = {}) => render(await DpsAsistenciaPage({ searchParams: Promise.resolve(query) }))

beforeEach(() => {
  jest.clearAllMocks()
  recibidas.length = 0
  isDreamTeamEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  respuestas = {
    dps_planes_rango: { data: [plan('p1', '2026-11-01'), plan('p2', '2026-11-08')], error: null },
    dps_asistencia_planilla: { data: PLANILLA, error: null },
  }
})

describe('/dps/asistencia', () => {
  it("loads the window and today's plan sheet", async () => {
    await pagina()
    expect(metadata).toEqual({ title: 'Asistencia — DPS' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-10-25', p_hasta: '2026-11-08' })
    expect(rpc).toHaveBeenCalledWith('dps_asistencia_planilla', { p_plan_id: 'p2', p_equipo_id: null })
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(ultima()).toMatchObject({ plan: { id: 'p2' }, planilla: { planId: 'p2', editable: true }, error: null })
    expect((ultima().planes as unknown[]).length).toBe(2)
  })

  it('opens another plan of the window from ?plan=', async () => {
    await pagina({ plan: 'p1' })
    expect(rpc).toHaveBeenCalledWith('dps_asistencia_planilla', { p_plan_id: 'p1', p_equipo_id: null })
    expect(ultima()).toMatchObject({ plan: { id: 'p1' } })
  })

  it('gives the "no teams" state when the sheet says sin_autoridad', async () => {
    respuestas.dps_asistencia_planilla = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await pagina()
    expect(ultima()).toMatchObject({ planilla: null, error: { sinEquipos: true, mensaje: 'No tienes equipos para pasar asistencia en este plan.' } })
  })

  it('has no plan to load in an empty window', async () => {
    respuestas.dps_planes_rango = { data: [], error: null }
    await pagina()
    expect(rpc).not.toHaveBeenCalledWith('dps_asistencia_planilla', expect.anything())
    expect(ultima()).toMatchObject({ plan: null, planilla: null, error: null })
  })

  it('is a 404 for someone who does not see DPS, or with Dream Team off', async () => {
    respuestas.dps_planes_rango = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(pagina()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a signed-out visitor to /login', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    await expect(pagina()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})
