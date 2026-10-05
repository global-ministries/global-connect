/**
 * /admin/dream-team/servidores (RSC): authorization, the filters read from the
 * URL (including the legacy `?equipo=` and `?estado=`), the flat rows handed to
 * the island, and the contract that only serializable data crosses the RSC
 * boundary.
 */
import React from 'react'

import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'
import type { NodoEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
const requireDreamTeamSession = jest.fn()
const hasDreamTeamReadCapability = jest.fn(() => true)
const hasDreamTeamWriteCapability = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: () => requireDreamTeamSession(),
  hasDreamTeamReadCapability: () => hasDreamTeamReadCapability(),
  hasDreamTeamWriteCapability: () => hasDreamTeamWriteCapability(),
}))

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
jest.mock('@/lib/platform/dream-team/turnos', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/turnos'),
  fetchTurnos: async () => [],
  fetchTurnosDeServicios: async () => new Map(),
}))

const EQUIPOS: DreamTeamEquipo[] = [
  { id: 'dir-a', experiencia: 'talleres_crecimiento', label: 'Dirección A', activo: true },
  { id: 'eq-a1', experiencia: 'talleres_crecimiento', label: 'Equipo A1', parentEquipoId: 'dir-a', activo: true },
  { id: 'dir-b', experiencia: 'talleres_crecimiento', label: 'Dirección B', activo: true },
  { id: 'gdv-raiz', experiencia: 'grupos_vida', label: 'Dirección de Grupos de Vida', activo: true },
]
const ROLES: DreamTeamRol[] = ['director', 'coordinador', 'facilitador'].map((label) => ({
  id: `rol-${label}`,
  equipoId: 'x',
  label,
  activo: true,
}))
const servicio = (id: string, equipoId: string, rol: string, persona: string, estado: DreamTeamServicio['estado'] = 'activo'): DreamTeamServicio => ({
  id,
  personaId: personaId(persona),
  equipoId,
  rolId: `rol-${rol}`,
  estado,
  fechaInicio: '2026-01-01T00:00:00.000Z',
  motivoActual: 'admin_asignacion',
  version: 3,
})

let mockServicios: DreamTeamServicio[] = []
let mockLideres: DreamTeamLiderGdv[] = []
let mockNodosGdv: NodoEstructuraGdv[] = []
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => EQUIPOS,
    listServicios: async () => mockServicios,
    listRolesPorEquipo: async () => ROLES,
  }),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => mockNodosGdv }))
jest.mock('@/lib/platform/dream-team/lideres-gdv', () => ({ fetchLideresGdv: async () => mockLideres }))
const fetchContactosPersonas = jest.fn()
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchNombresPersonas: async () =>
    new Map([
      ['p1', 'Ana Directora'],
      ['p2', 'Bea Coordinadora'],
      ['p3', 'Carla Facilitadora'],
      ['g1', 'Marta Lider'],
      ['d1', 'Diego Etapa'],
      ['d2', 'Dora General'],
    ]),
  fetchContactosPersonas: (...args: unknown[]) => fetchContactosPersonas(...args),
}))

import DreamTeamServidoresPage from '@/app/(auth)/admin/dream-team/servidores/page'
import { ServidoresClient, type ServidoresClientProps } from '@/components/dream-team/servidores/servidores-client'
import { FILTROS_INICIALES } from '@/lib/platform/dream-team/servidores-vista'

async function renderizar(searchParams?: Record<string, string | string[] | undefined>): Promise<ServidoresClientProps> {
  const element = (await DreamTeamServidoresPage({
    searchParams: Promise.resolve(searchParams ?? {}),
  })) as React.ReactElement<ServidoresClientProps>
  expect(element.type).toBe(ServidoresClient)
  return element.props
}

/** Anything that is not JSON-safe data (functions, components, class instances) breaks an RSC boundary. */
function esSerializable(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true
  if (['string', 'number', 'boolean'].includes(typeof valor)) return true
  if (Array.isArray(valor)) return valor.every(esSerializable)
  if (typeof valor === 'object') {
    const proto = Object.getPrototypeOf(valor)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.values(valor as Record<string, unknown>).every(esSerializable)
  }
  return false
}

beforeEach(() => {
  notFound.mockClear()
  redirect.mockClear()
  isDreamTeamEnabled.mockReturnValue(true)
  hasDreamTeamReadCapability.mockReturnValue(true)
  hasDreamTeamWriteCapability.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue({ personaId: 'me' })
  fetchContactosPersonas.mockReset().mockResolvedValue(
    new Map([
      ['p1', { telefono: '04125457346', tieneCuenta: true }],
      ['p2', { telefono: null, tieneCuenta: false }],
      ['g1', { telefono: '04245551111', tieneCuenta: false }],
    ]),
  )
  mockServicios = [
    servicio('s1', 'dir-a', 'director', 'p1'),
    servicio('s2', 'eq-a1', 'coordinador', 'p2', 'en_pausa'),
    servicio('s3', 'eq-a1', 'facilitador', 'p3'),
  ]
  mockLideres = [{ personaId: personaId('g1'), equipoId: 'eq-a1', rol: 'lider', desde: '2026-03-01T00:00:00.000Z' }]
  mockNodosGdv = []
})

describe('authorization', () => {
  it('404s when Dream Team is off or the session cannot read it, and redirects without a session', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
    isDreamTeamEnabled.mockReturnValue(true)
    hasDreamTeamReadCapability.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
    hasDreamTeamReadCapability.mockReturnValue(true)
    requireDreamTeamSession.mockResolvedValue(null)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})

describe('rows', () => {
  it('builds one flat row per servicio and per Grupos de Vida leader, resolved server-side', async () => {
    const { filas } = await renderizar()
    expect(filas).toHaveLength(4)
    expect(filas[0]).toMatchObject({
      clave: 's1',
      nombre: 'Ana Directora',
      equipoLabel: 'Dirección A',
      equipoRuta: '',
      direccionId: 'dir-a',
      rolLabel: 'Director',
      estado: 'activo',
      origen: 'dream_team',
      servicioId: 's1',
      version: 3,
      editable: true,
    })
    expect(filas[1]).toMatchObject({ equipoLabel: 'Equipo A1', equipoRuta: 'Dirección A', direccionId: 'dir-a', estado: 'en_pausa' })
    expect(filas[3]).toMatchObject({
      clave: 'gdv:g1:eq-a1',
      nombre: 'Marta Lider',
      rolLabel: 'Líder de grupo',
      estado: 'activo',
      origen: 'grupos_vida',
      editable: false,
    })
  })

  it('adds the phone and account status of each persona from the scoped contacts RPC, once for everyone', async () => {
    const { filas } = await renderizar()
    expect(fetchContactosPersonas).toHaveBeenCalledTimes(1)
    expect(fetchContactosPersonas.mock.calls[0][1]).toEqual(['p1', 'p2', 'p3', 'g1'])
    expect(filas[0]).toMatchObject({ telefono: '04125457346', tieneCuenta: true })
    expect(filas[1]).toMatchObject({ telefono: null, tieneCuenta: false })
  })

  it('gives a Grupos de Vida leader the same phone and account status as any other row (still read-only)', async () => {
    const { filas } = await renderizar()
    expect(filas[3]).toMatchObject({ origen: 'grupos_vida', telefono: '04245551111', tieneCuenta: false, editable: false })
  })

  it('leaves phone and account status unknown for a persona the RPC does not return (never "sin cuenta")', async () => {
    const { filas } = await renderizar()
    // p3 is not returned by the RPC.
    expect(filas[2]).toMatchObject({ telefono: null, tieneCuenta: null })
  })

  it('marks rows read-only for a viewer without write capability', async () => {
    hasDreamTeamWriteCapability.mockReturnValue(false)
    const props = await renderizar()
    expect(props.puedeEditar).toBe(false)
    expect(props.filas.every((f) => !f.editable)).toBe(true)
  })

  it('hands the island only serializable data', async () => {
    const props = await renderizar({ equipo: 'eq-a1', q: 'ana' })
    expect(esSerializable(props)).toBe(true)
  })
})

// The directors of Grupos de Vida come from the same RPC as the leaders (rol
// `director_etapa` on their `directores` node, `director_general` on their
// segmento), and their team name resolves from the virtual branch.
describe('Grupos de Vida directors', () => {
  const NODOS: NodoEstructuraGdv[] = [
    { nodoId: 'gdv-raiz', parentId: null, tipo: 'direccion', label: 'Dirección de Grupos de Vida', responsables: [] },
    { nodoId: 'seg-1', parentId: 'gdv-raiz', tipo: 'segmento', label: 'Matrimonios', responsables: [] },
    { nodoId: 'dir-etapa-1', parentId: 'seg-1', tipo: 'directores', label: 'Diego Etapa y Dana Etapa', responsables: [] },
  ]
  const LIDERES: DreamTeamLiderGdv[] = [
    { personaId: personaId('d1'), equipoId: 'dir-etapa-1', rol: 'director_etapa', desde: null },
    { personaId: personaId('d2'), equipoId: 'seg-1', rol: 'director_general', desde: '2026-05-01T00:00:00.000Z' },
  ]

  beforeEach(() => {
    mockNodosGdv = NODOS
    mockLideres = LIDERES
    mockServicios = []
    fetchContactosPersonas.mockResolvedValue(
      new Map([
        ['d1', { telefono: '04245551111', tieneCuenta: false }],
        ['d2', { telefono: '04125552222', tieneCuenta: true }],
      ]),
    )
  })

  it('builds one row per director on the node of their team, with role, phone and account', async () => {
    const { filas } = await renderizar()
    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({
      clave: 'gdv:d1:dir-etapa-1',
      nombre: 'Diego Etapa',
      equipoId: 'dir-etapa-1',
      equipoLabel: 'Diego Etapa y Dana Etapa',
      equipoRuta: 'Dirección de Grupos de Vida · Matrimonios',
      direccionId: 'gdv-raiz',
      rolLabel: 'Director de etapa',
      estado: 'activo',
      fechaInicio: null,
      telefono: '04245551111',
      tieneCuenta: false,
      origen: 'grupos_vida',
      editable: false,
    })
    expect(filas[1]).toMatchObject({
      clave: 'gdv:d2:seg-1',
      nombre: 'Dora General',
      equipoLabel: 'Matrimonios',
      equipoRuta: 'Dirección de Grupos de Vida',
      rolLabel: 'Director general',
      fechaInicio: '2026-05-01T00:00:00.000Z',
      telefono: '04125552222',
      tieneCuenta: true,
      editable: false,
    })
  })

  it('resolves names and contacts of the directors in the same single bulk calls', async () => {
    await renderizar()
    expect(fetchContactosPersonas).toHaveBeenCalledTimes(1)
    expect(fetchContactosPersonas.mock.calls[0][1]).toEqual(['d1', 'd2'])
  })

  it('keeps a director who also leads a group as one row per team', async () => {
    mockLideres = [
      ...LIDERES,
      { personaId: personaId('d1'), equipoId: 'seg-1', rol: 'lider', desde: '2026-03-01T00:00:00.000Z' },
    ]
    const { filas } = await renderizar()
    expect(filas.filter((f) => f.personaId === 'd1').map((f) => [f.clave, f.rolLabel])).toEqual([
      ['gdv:d1:dir-etapa-1', 'Director de etapa'],
      ['gdv:d1:seg-1', 'Líder de grupo'],
    ])
  })

  it('falls back like a leader when the node of the director is not visible', async () => {
    mockNodosGdv = []
    const { filas } = await renderizar()
    expect(filas[0]).toMatchObject({ nombre: 'Diego Etapa', equipoLabel: 'Equipo no encontrado', equipoRuta: '', direccionId: 'dir-etapa-1' })
  })

  it('hands the island only serializable data, a missing start date included', async () => {
    expect(esSerializable(await renderizar())).toBe(true)
  })
})

describe('filters from the URL', () => {
  it('starts without filters for a bare URL', async () => {
    expect((await renderizar()).filtrosIniciales).toEqual(FILTROS_INICIALES)
  })

  it('reads every filter of the URL', async () => {
    const { filtrosIniciales } = await renderizar({
      etapa: 'activo',
      direccion: 'dir-a',
      area: 'eq-a',
      equipo: 'eq-a1',
      rol: 'Coordinador',
      turno: 't-1',
      inicio: 'mes',
      sin_cuenta: '1',
      varios: '1',
      q: 'ana',
      agrupar: 'persona',
      orden: 'equipo:desc',
    })
    expect(filtrosIniciales).toEqual({
      etapa: 'activo',
      direccion: 'dir-a',
      area: 'eq-a',
      equipo: 'eq-a1',
      rol: 'Coordinador',
      turno: 't-1',
      inicio: 'mes',
      sinCuenta: true,
      varios: true,
      q: 'ana',
      agrupar: 'persona',
      orden: { columna: 'equipo', sentido: 'desc' },
    })
  })

  it('keeps the legacy ?equipo= and ?estado= working (links from Talleres and Estructura)', async () => {
    const { filtrosIniciales } = await renderizar({ equipo: 'eq-a1', estado: 'en_pausa' })
    expect(filtrosIniciales).toMatchObject({ equipo: 'eq-a1', etapa: 'en_pausa' })
  })

  it('accepts a page rendered without searchParams', async () => {
    const element = (await DreamTeamServidoresPage()) as React.ReactElement<ServidoresClientProps>
    expect(element.props.filtrosIniciales).toEqual(FILTROS_INICIALES)
  })
})
