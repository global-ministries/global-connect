/**
 * /estudiantes/promocion (RSC, C6b3): which campuses it offers (where the
 * caller manages Transit / Inside Out and has the authority of S15), which one
 * opens, and what it hands the client island (the preview, a campus without a
 * year scale, an error). The Supabase client is a double that answers each RPC
 * by name and campus. Every name is fictitious.
 */
import React from 'react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

type Respuesta = { data: unknown; error: null | { code?: string; message: string } }
let subareas: Respuesta = { data: [], error: null }
let vistas: Record<string, Respuesta> = {}
const rpc = jest.fn(async (nombre: string, args?: { p_campus_id?: string }) => {
  if (nombre === 'estudiantes_subareas_gestionables') return subareas
  if (nombre === 'estudiantes_promocion_vista') return vistas[args?.p_campus_id ?? ''] ?? { data: null, error: null }
  return { data: null, error: null }
})
let usuario: { id: string } | null = { id: 'auth-1' }

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    rpc: (nombre: string, args?: { p_campus_id?: string }) => rpc(nombre, args),
  }),
}))

jest.mock('@/components/estudiantes/promocion/promocion-client', () => ({
  PromocionClient: (props: unknown) => <div data-props={JSON.stringify(props)} />,
}))

import EstudiantesPromocionPage from '@/app/(auth)/estudiantes/promocion/page'

const C1 = 'd0000000-0000-4000-8000-000000000001'
const C2 = 'd0000000-0000-4000-8000-000000000002'

const subarea = (campus_id: string, campus: string, experiencia = 'estudiantes') => ({
  subarea_id: `${campus_id}-${experiencia}`,
  subarea: 'Grupos de Chicas',
  ambito_id: `${experiencia}-a`,
  ambito: experiencia === 'estudiantes' ? 'Transit' : 'The Living Room',
  experiencia,
  campus_id,
  campus,
  responsables: [],
})

const vista = (id: string, nombre: string) => ({
  campus: { id, nombre },
  bloqueado: false,
  ultima: null,
  ambitos: [],
  the_living_room: null,
  grupos: [],
  egresados: [],
  sin_grupo: [],
  totales: {},
})

interface PropsCliente {
  readonly campus: unknown
  readonly campusId: string
  readonly contenido: { readonly tipo: string; readonly vista?: { readonly campus: unknown } }
  readonly filtrosIniciales: unknown
}

const propsDe = (elemento: React.ReactElement): PropsCliente => elemento.props as PropsCliente

beforeEach(() => {
  jest.clearAllMocks()
  usuario = { id: 'auth-1' }
  subareas = { data: [subarea(C2, 'Oeste'), subarea(C1, 'Norte')], error: null }
  vistas = { [C1]: { data: vista(C1, 'Norte'), error: null }, [C2]: { data: vista(C2, 'Oeste'), error: null } }
})

describe('/estudiantes/promocion', () => {
  it('sends a signed-out visitor to the login', async () => {
    usuario = null
    await expect(EstudiantesPromocionPage({})).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('is not found for whoever manages no Transit / Inside Out sub-área', async () => {
    subareas = { data: [subarea(C1, 'Norte', 'the_living_room')], error: null }
    await expect(EstudiantesPromocionPage({})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).not.toHaveBeenCalledWith('estudiantes_promocion_vista', expect.anything())
  })

  it('is not found without the authority of S15 on any campus', async () => {
    vistas = { [C1]: { data: null, error: { code: '42501', message: 'sin_autoridad' } }, [C2]: { data: null, error: { code: '42501', message: 'sin_autoridad' } } }
    await expect(EstudiantesPromocionPage({})).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('opens the first campus by name with its preview and filters from the URL', async () => {
    const elemento = (await EstudiantesPromocionPage({ searchParams: Promise.resolve({ metrica: 'egresan' }) })) as React.ReactElement
    const props = propsDe(elemento)
    expect(props.campus).toEqual([
      { id: C1, nombre: 'Norte' },
      { id: C2, nombre: 'Oeste' },
    ])
    expect(props.campusId).toBe(C1)
    expect(props.contenido.tipo).toBe('vista')
    expect(props.contenido.vista?.campus).toEqual({ id: C1, nombre: 'Norte' })
    expect(props.filtrosIniciales).toEqual({ ambito: null, metrica: 'egresan', q: '' })
    expect(elemento.key).toBe(C1)
  })

  it('opens ?campus= and leaves out the campuses without authority', async () => {
    vistas[C1] = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    const props = propsDe((await EstudiantesPromocionPage({ searchParams: Promise.resolve({ campus: C1 }) })) as React.ReactElement)
    expect(props.campus).toEqual([{ id: C2, nombre: 'Oeste' }])
    expect(props.campusId).toBe(C2)
  })

  it('explains a campus without a year scale', async () => {
    vistas[C1] = { data: null, error: { code: '22023', message: 'escala_invalida' } }
    const props = propsDe((await EstudiantesPromocionPage({})) as React.ReactElement)
    expect(props.contenido).toEqual({ tipo: 'sin_escala' })
  })

  it('shows any other error in Spanish', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    vistas[C1] = { data: null, error: { code: 'XX000', message: 'boom' } }
    const props = propsDe((await EstudiantesPromocionPage({})) as React.ReactElement)
    expect(props.contenido).toEqual({ tipo: 'error', mensaje: 'No se pudo cargar la promoción. Recarga la página.' })
  })
})
