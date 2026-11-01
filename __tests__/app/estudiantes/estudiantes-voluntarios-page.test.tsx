/**
 * /estudiantes/voluntarios (RSC, C5): who gets the volunteer attendance,
 * which service and date open (a dated service only on its planned dates)
 * and the roster it loads. The Supabase client is a double that answers each
 * RPC by name. Every person is fictitious.
 */
import React from 'react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-31',
}))

type Respuesta = { data: unknown; error: null | { code?: string; message: string } }
let respuestas: Record<string, Respuesta> = {}
const rpc = jest.fn(async (nombre: string, _args?: unknown) => respuestas[nombre] ?? { data: null, error: null })
let usuario: { id: string } | null = { id: 'auth-1' }

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    rpc: (nombre: string, args?: unknown) => rpc(nombre, args),
  }),
}))

jest.mock('@/components/estudiantes/voluntarios/voluntarios-client', () => ({
  VoluntariosClient: (props: unknown) => <div data-props={JSON.stringify(props)} />,
}))

import EstudiantesVoluntariosPage from '@/app/(auth)/estudiantes/voluntarios/page'

const TURNOS = [
  { id: 't1', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Barquisimeto', tipo: 'semanal', fechas: [] },
  { id: 't3', nombre: 'The Living Room', hora: '19:00:00', orden: 3, dia_semana: 0, campus_id: 'c1', campus: 'Barquisimeto', tipo: 'fechas', fechas: ['2026-10-28'] },
]
const PLANILLA = { turno: 'Domingo 9:00', fecha: '2026-10-25', editable: true, areas: [{ id: 'a1', nombre: 'Transit' }], voluntarios: [] }

const propsDe = (elemento: React.ReactElement): Record<string, unknown> => elemento.props as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  usuario = { id: 'auth-1' }
  respuestas = {
    estudiantes_puede_marcar_voluntarios: { data: true, error: null },
    estudiantes_voluntarios_turnos: { data: TURNOS, error: null },
    estudiantes_voluntarios_planilla: { data: PLANILLA, error: null },
  }
})

describe('/estudiantes/voluntarios', () => {
  it('sends a signed-out visitor to the login', async () => {
    usuario = null
    await expect(EstudiantesVoluntariosPage({})).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('is not found for whoever may mark no volunteer', async () => {
    respuestas.estudiantes_puede_marcar_voluntarios = { data: false, error: null }
    await expect(EstudiantesVoluntariosPage({})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).not.toHaveBeenCalledWith('estudiantes_voluntarios_planilla', expect.anything())
  })

  it('opens the first service on its last date and loads its roster', async () => {
    const elemento = (await EstudiantesVoluntariosPage({})) as React.ReactElement
    expect(rpc).toHaveBeenCalledWith('estudiantes_voluntarios_planilla', { p_turno_id: 't1', p_fecha: '2026-10-25' })
    const props = propsDe(elemento)
    expect(props).toMatchObject({ servicio: { turnoId: 't1', fecha: '2026-10-25' }, error: null, ambitoInicial: null, hoy: '2026-10-31' })
    expect(props.planilla).toMatchObject({ editable: true, areas: [{ id: 'a1', nombre: 'Transit' }] })
    expect(props.turnos).toHaveLength(2)
    expect(elemento.key).toBe('t1|2026-10-25')
  })

  it('opens a dated service only on a planned date', async () => {
    const props = propsDe(
      (await EstudiantesVoluntariosPage({ searchParams: Promise.resolve({ turno: 't3', fecha: '2026-10-29', ambito: 'a9' }) })) as React.ReactElement,
    )
    expect(rpc).toHaveBeenCalledWith('estudiantes_voluntarios_planilla', { p_turno_id: 't3', p_fecha: '2026-10-28' })
    expect(props).toMatchObject({ servicio: { turnoId: 't3', fecha: '2026-10-28' }, ambitoInicial: 'a9' })
  })

  it('loads no roster for a dated service without planned dates', async () => {
    respuestas.estudiantes_voluntarios_turnos = { data: [{ ...TURNOS[1], fechas: [] }], error: null }
    const props = propsDe((await EstudiantesVoluntariosPage({})) as React.ReactElement)
    expect(rpc).not.toHaveBeenCalledWith('estudiantes_voluntarios_planilla', expect.anything())
    expect(props).toMatchObject({ servicio: { turnoId: 't3', fecha: null }, planilla: null, error: null })
  })

  it('keeps the page and explains when the roster fails', async () => {
    respuestas.estudiantes_voluntarios_planilla = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    const props = propsDe((await EstudiantesVoluntariosPage({})) as React.ReactElement)
    expect(props).toMatchObject({ planilla: null, error: 'No tienes voluntarios para marcar en este servicio.' })
  })
})
