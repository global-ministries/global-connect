/**
 * /estudiantes/vivo (RSC, C4b): who gets the live view, which meeting opens,
 * the empty state without meetings and the app's not-found state for whoever
 * has no live view. The Supabase client is a double that answers each RPC by
 * name. Every person is fictitious.
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
  hoyEnCaracas: () => '2026-10-25',
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

jest.mock('@/components/estudiantes/vivo/vivo-client', () => ({
  VivoClient: (props: unknown) => <div data-props={JSON.stringify(props)} />,
}))

import EstudiantesVivoPage from '@/app/(auth)/estudiantes/vivo/page'

const opcion = (ambito_id: string, ambito: string, fecha: string, turno_id: string) => ({
  ambito_id,
  ambito,
  campus_id: 'c1',
  campus: 'Barquisimeto',
  fecha,
  turno_id,
  turno: '1er servicio',
  hora: '09:00:00',
})

const OPCIONES = [opcion('a-io', 'Inside Out', '2026-10-25', 't2'), opcion('a-t', 'Transit', '2026-10-25', 't1'), opcion('a-t', 'Transit', '2026-10-18', 't1')]
const EN_VIVO = { ambito_id: 'a-t', fecha: '2026-10-18', turno_id: 't1', grupos: [], visitantes_hoy: [] }

const propsDe = (elemento: React.ReactElement): Record<string, unknown> => elemento.props as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  usuario = { id: 'auth-1' }
  respuestas = {}
})

describe('/estudiantes/vivo', () => {
  it('sends a signed-out visitor to the login', async () => {
    usuario = null
    await expect(EstudiantesVivoPage({})).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('is not found for whoever has no live view and no meeting', async () => {
    respuestas = {
      estudiantes_vivo_opciones: { data: [], error: null },
      estudiantes_acceso: { data: { grupos: 1, lidera: true, vivo: false, gestiona: false }, error: null },
    }
    await expect(EstudiantesVivoPage({})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).not.toHaveBeenCalledWith('estudiantes_en_vivo', expect.anything())
  })

  it('shows the empty state to a director without a meeting in the last days', async () => {
    respuestas = {
      estudiantes_vivo_opciones: { data: [], error: null },
      estudiantes_acceso: { data: { grupos: 0, lidera: false, vivo: true, gestiona: true }, error: null },
    }
    const props = propsDe((await EstudiantesVivoPage({})) as React.ReactElement)
    expect(props).toMatchObject({ opciones: [], opcion: null, datos: null })
  })

  it('opens the requested meeting and loads its live data', async () => {
    respuestas = {
      estudiantes_vivo_opciones: { data: OPCIONES, error: null },
      estudiantes_acceso: { data: { grupos: 6, lidera: false, vivo: true, gestiona: true }, error: null },
      estudiantes_en_vivo: { data: EN_VIVO, error: null },
    }
    const elemento = (await EstudiantesVivoPage({
      searchParams: Promise.resolve({ ambito: 'a-t', campus: 'c1', fecha: '2026-10-18', turno: 't1', metrica: 'ausentes' }),
    })) as React.ReactElement
    expect(rpc).toHaveBeenCalledWith('estudiantes_en_vivo', { p_ambito_id: 'a-t', p_fecha: '2026-10-18', p_turno_id: 't1' })
    const props = propsDe(elemento)
    expect(props.opcion).toMatchObject({ ambitoId: 'a-t', fecha: '2026-10-18', turnoId: 't1' })
    expect(props.datos).toMatchObject({ fecha: '2026-10-18', grupos: [], visitantesHoy: [] })
    expect(props.filtrosIniciales).toMatchObject({ metrica: 'ausentes' })
    expect(props.error).toBeNull()
    expect(elemento.key).toBe('a-t|c1|2026-10-18|t1')
  })

  it('opens today by default and keeps the page when the live data fails', async () => {
    respuestas = {
      estudiantes_vivo_opciones: { data: OPCIONES, error: null },
      estudiantes_acceso: { data: null, error: { message: 'boom' } },
      estudiantes_en_vivo: { data: null, error: { code: '42501', message: 'sin_autoridad' } },
    }
    const props = propsDe((await EstudiantesVivoPage({})) as React.ReactElement)
    expect(props.opcion).toMatchObject({ ambitoId: 'a-io', fecha: '2026-10-25' })
    expect(props.datos).toBeNull()
    expect(props.error).toBe('No tienes acceso a la vista en vivo de este ámbito.')
  })
})
