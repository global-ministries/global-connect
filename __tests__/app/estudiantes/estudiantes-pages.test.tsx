/**
 * /estudiantes and /estudiantes/grupos/[grupoId] (RSC, C3b): who goes
 * straight to their group, who gets the list of groups, and who gets the
 * app's not-found state. The Supabase client is a double that answers each
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

type Respuesta = { data: unknown; error: null | { message: string } }
let respuestas: Record<string, Respuesta> = {}
const rpc = jest.fn(async (nombre: string, _args?: unknown) => respuestas[nombre] ?? { data: null, error: null })
let usuario: { id: string } | null = { id: 'auth-1' }

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    rpc: (nombre: string, args?: unknown) => rpc(nombre, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { genero: 'Femenino' }, error: null }) }) }) }),
  }),
}))

jest.mock('@/components/estudiantes/mis-grupos-client', () => ({
  MisGruposClient: (props: { grupos: unknown[]; puedeGestionar: boolean }) => <div data-props={JSON.stringify(props)} />,
}))
jest.mock('@/components/estudiantes/lista/lista-lider-client', () => ({
  ListaLiderClient: (props: { datos: unknown; desde?: string }) => <div data-props={JSON.stringify(props)} />,
}))

import EstudiantesPage from '@/app/(auth)/estudiantes/page'
import ListaGrupoPage from '@/app/(auth)/estudiantes/grupos/[grupoId]/page'

const G2 = '22222222-2222-4222-8222-222222222222'
const G3 = '33333333-3333-4333-8333-333333333333'

function fila(id: string, nombre: string, extra: Record<string, unknown> = {}) {
  return {
    grupo_id: id,
    nombre,
    campus_id: 'c1',
    ambito_id: 'a1',
    ambito: 'Transit',
    experiencia: 'estudiantes',
    subarea_id: 's1',
    subarea: 'Grupos de Chicas',
    anio: 2,
    anio_etiqueta: '2do año',
    zona: null,
    dia_semana: null,
    hora: null,
    activo: true,
    soy_lider: true,
    puede_ver_vivo: false,
    puede_gestionar: false,
    miembros: 3,
    visitantes: 0,
    lideres: [],
    ...extra,
  }
}

const propsDe = (elemento: React.ReactElement): Record<string, unknown> => elemento.props as Record<string, unknown>

beforeEach(() => {
  jest.clearAllMocks()
  usuario = { id: 'auth-1' }
  respuestas = {}
})

describe('/estudiantes', () => {
  it('a leader with a single group goes straight to its list', async () => {
    respuestas = { estudiantes_mis_grupos: { data: [fila(G2, '2do año · Chicas')], error: null }, estudiantes_subareas_gestionables: { data: [], error: null } }
    await expect(EstudiantesPage()).rejects.toThrow(`NEXT_REDIRECT:/estudiantes/grupos/${G2}`)
  })

  it('someone with more groups, or a manager, gets the list', async () => {
    respuestas = {
      estudiantes_mis_grupos: { data: [fila(G2, '2do año · Chicas'), fila(G3, '3er año · Chicas')], error: null },
      estudiantes_subareas_gestionables: { data: [], error: null },
    }
    const elemento = (await EstudiantesPage()) as React.ReactElement
    expect(propsDe(elemento)).toMatchObject({ puedeGestionar: false })
    expect((propsDe(elemento).grupos as unknown[]).length).toBe(2)

    respuestas = {
      estudiantes_mis_grupos: { data: [fila(G2, '2do año · Chicas')], error: null },
      estudiantes_subareas_gestionables: { data: [{ subarea_id: 's1' }], error: null },
    }
    expect(propsDe((await EstudiantesPage()) as React.ReactElement)).toMatchObject({ puedeGestionar: true })
  })

  it('offers "En vivo" to whoever has the live view (C4b), and fails closed', async () => {
    respuestas = {
      estudiantes_mis_grupos: { data: [fila(G2, '2do año · Chicas'), fila(G3, '3er año · Chicas')], error: null },
      estudiantes_subareas_gestionables: { data: [], error: null },
      estudiantes_acceso: { data: { grupos: 2, lidera: false, vivo: true, gestiona: false }, error: null },
    }
    expect(propsDe((await EstudiantesPage()) as React.ReactElement)).toMatchObject({ puedeVerVivo: true })

    respuestas = { ...respuestas, estudiantes_acceso: { data: null, error: { message: 'boom' } } }
    expect(propsDe((await EstudiantesPage()) as React.ReactElement)).toMatchObject({ puedeVerVivo: false })
  })

  it('sends a signed-out visitor to the login', async () => {
    usuario = null
    await expect(EstudiantesPage()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})

describe('/estudiantes/grupos/[grupoId]', () => {
  const pagina = (grupoId: string, parametros: Record<string, string> = {}) =>
    ListaGrupoPage({ params: Promise.resolve({ grupoId }), searchParams: Promise.resolve(parametros) })

  it('a group the caller does not see, or a malformed id, is not found', async () => {
    respuestas = { estudiantes_mis_grupos: { data: [fila(G3, '3er año · Chicas')], error: null } }
    await expect(pagina(G2)).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(pagina('g2')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('loads the newest meeting, its roster and history, and passes the origin', async () => {
    respuestas = {
      estudiantes_mis_grupos: { data: [fila(G2, '2do año · Chicas')], error: null },
      estudiantes_grupo_sesiones: { data: [{ fecha: '2026-10-25', turno_id: 't9', turno: 'Domingo 9:00', hora: '09:00:00', reunion_id: null, lugar: null, presentes: 0, ausentes: 0, visitantes: 0, marcados: 0 }], error: null },
      estudiantes_escala_campus: { data: [{ numero: 2, etiqueta: '2do año', ambito_id: 'a1', ambito: 'Transit' }], error: null },
      estudiantes_grupo_lista: { data: { grupo: { id: G2, nombre: '2do año · Chicas', experiencia: 'estudiantes' }, fecha: '2026-10-25', turno_id: 't9', personas: [] }, error: null },
      estudiantes_grupo_historial: { data: { reuniones: [], personas: [] }, error: null },
    }
    const elemento = (await pagina(G2, { desde: 'grupos' })) as React.ReactElement
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_lista', { p_grupo_id: G2, p_fecha: '2026-10-25', p_turno_id: 't9' })
    expect(elemento.key).toBe('2026-10-25|t9')
    const props = propsDe(elemento)
    expect(props.desde).toBe('grupos')
    expect(props.datos).toMatchObject({ sesion: { fecha: '2026-10-25', turnoId: 't9' }, esRaiz: true, generoVisor: 'Femenino' })
  })
})
