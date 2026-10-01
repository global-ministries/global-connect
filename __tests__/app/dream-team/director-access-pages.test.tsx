/**
 * Grupos de Vida directors in Dream Team — the pages, with the REAL gates.
 *
 * A director general / director de etapa (system role, NO Dream Team
 * capability) opens /dream-team/mi-equipo read-only and gets only the part of
 * Grupos de Vida the database hands them: RLS returns no real Dream Team
 * equipos for them, so the tree is the virtual Grupos de Vida branch alone and
 * its topmost visible node (the segmento) is the root. Servidores and
 * Estructura keep today's gate: a director without capability gets notFound().
 *
 * Unlike mi-equipo-page.test.tsx, which mocks the gate functions to exercise
 * the page, this file keeps the real capability/role gates and mocks only the
 * data sources, so it proves page + gate together. requireDreamTeamSession
 * mirrors production: the session carries roles only when `includeRoles` is
 * asked for.
 */
import React from 'react'

import type { DreamTeamEquipo } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamLiderGdv } from '@/lib/platform/dream-team/lideres-gdv'
import type { NodoEstructuraGdv } from '@/lib/platform/dream-team/estructura-gdv'
import type { PlatformSession, PlatformSessionCapability } from '@/lib/platform/session/types'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

let mockEnabled = true
let mockSession: PlatformSession | null = null
const requireDreamTeamSession = jest.fn(async (options?: { includeRoles?: boolean }) =>
  mockSession ? { ...mockSession, globalRoles: options?.includeRoles ? mockSession.globalRoles : [] } : null,
)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/capabilities'),
  isDreamTeamEnabled: () => mockEnabled,
  requireDreamTeamSession: (options?: { includeRoles?: boolean }) => requireDreamTeamSession(options),
}))

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
// The Estructura island imports the server actions; loading them under jsdom is out of scope for a page test.
jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({}))

let mockEquipos: DreamTeamEquipo[] = []
let mockLideres: DreamTeamLiderGdv[] = []
let mockNodosGdv: NodoEstructuraGdv[] = []
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => mockEquipos,
    listServicios: async () => [],
    listRolesPorEquipo: async () => [],
  }),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => mockNodosGdv }))
jest.mock('@/lib/platform/dream-team/lideres-gdv', () => ({ fetchLideresGdv: async () => mockLideres }))
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchNombresPersonas: async () =>
    new Map([
      ['dg', 'Dora General'],
      ['de', 'Diego Etapa'],
      ['de2', 'Dana Etapa'],
      ['l1', 'Lidia Lider'],
      ['l2', 'Luis Lider'],
    ]),
  fetchContactosPersonas: async () => new Map(),
}))

import DreamTeamMiEquipoPage from '@/app/(auth)/dream-team/mi-equipo/page'
import DreamTeamServidoresPage from '@/app/(auth)/admin/dream-team/servidores/page'
import DreamTeamEstructuraPage from '@/app/(auth)/admin/dream-team/estructura/page'
import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'

function session(globalRoles: string[], capabilities: PlatformSessionCapability[] = []): PlatformSession {
  return { personaId: 'viewer', subjectAuthId: 'auth-viewer', globalRoles, contexts: [], capabilities }
}

const orgManage: PlatformSessionCapability = {
  key: 'dream_team.org.manage',
  experience: 'dream_team',
  scopeType: 'experience',
  source: 'manual',
}

// What dream_team_estructura_gdv() hands a director de etapa of Matrimonios: the
// root, their segment, their team and its groups — and nothing real from
// dream_team_equipos (RLS: no capability, no rows).
const NODOS_DIRECTOR: NodoEstructuraGdv[] = [
  { nodoId: 'gdv-raiz', parentId: null, tipo: 'direccion', label: 'Dirección de Grupos de Vida', responsables: [] },
  { nodoId: 'seg-1', parentId: 'gdv-raiz', tipo: 'segmento', label: 'Matrimonios', responsables: [] },
  { nodoId: 'team-1', parentId: 'seg-1', tipo: 'directores', label: 'Diego Etapa', responsables: [] },
  { nodoId: 'grupo-1', parentId: 'team-1', tipo: 'grupo', label: 'Grupo Norte', responsables: [] },
  { nodoId: 'grupo-2', parentId: 'team-1', tipo: 'grupo', label: 'Grupo Sur', responsables: [] },
]
const LIDERES_DIRECTOR: DreamTeamLiderGdv[] = [
  { personaId: personaId('de'), equipoId: 'team-1', rol: 'director_etapa', desde: null },
  { personaId: personaId('l1'), equipoId: 'grupo-1', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
  { personaId: personaId('l2'), equipoId: 'grupo-2', rol: 'colider', desde: '2026-01-01T00:00:00.000Z' },
]

async function renderMiEquipo(searchParams?: { direccion?: string }): Promise<MiEquipoClientProps> {
  const element = (await DreamTeamMiEquipoPage({
    searchParams: Promise.resolve(searchParams ?? {}),
  })) as React.ReactElement<MiEquipoClientProps>
  expect(element.type).toBe(MiEquipoClient)
  return element.props
}

beforeEach(() => {
  mockEnabled = true
  mockSession = session(['director-etapa'])
  mockEquipos = []
  mockLideres = LIDERES_DIRECTOR
  mockNodosGdv = NODOS_DIRECTOR
  notFound.mockClear()
  redirect.mockClear()
  requireDreamTeamSession.mockClear()
})

describe('mi-equipo — a director de etapa without capability', () => {
  it('asks for the session roles (the gate is by system role)', async () => {
    await renderMiEquipo()
    expect(requireDreamTeamSession).toHaveBeenCalledWith({ includeRoles: true })
  })

  it.each([['director-etapa'], ['director-general']])('opens the page for %s', async (rol) => {
    mockSession = session([rol])
    const props = await renderMiEquipo()
    expect(props.vista).not.toBeNull()
  })

  it('is read-only: no edit flag, nothing to assign, no roles to offer, no editable row', async () => {
    const props = await renderMiEquipo()
    expect(props.puedeEditar).toBe(false)
    expect(props.equiposAsignables).toEqual([])
    expect(props.rolesPorEquipo).toEqual({})
    expect(props.vista?.personas.every((persona) => !persona.editable && persona.origen === 'grupos_vida')).toBe(true)
  })

  it('roots the tree at their segmento when the Grupos de Vida root is not readable', async () => {
    const props = await renderMiEquipo()
    expect(props.direcciones).toEqual([{ id: 'seg-1', label: 'Matrimonios', total: 3 }])
    expect(props.direccionId).toBe('seg-1')
    expect(props.vista?.label).toBe('Matrimonios')
  })

  it('shows their team and their groups as cards, with the people attached and named', async () => {
    const vista = (await renderMiEquipo()).vista
    expect(vista?.equipos.map((e) => [e.id, e.label, e.total])).toEqual([
      ['team-1', 'Diego Etapa', 1],
      ['grupo-1', 'Grupo Norte', 1],
      ['grupo-2', 'Grupo Sur', 1],
    ])
    expect(vista?.personas.map((p) => [p.nombre, p.rolLabel, p.equipoLabel])).toEqual([
      ['Diego Etapa', 'Director de etapa', 'Diego Etapa'],
      ['Lidia Lider', 'Líder de grupo', 'Grupo Norte'],
      ['Luis Lider', 'Aprendiz de grupo', 'Grupo Sur'],
    ])
  })

  it('shows an empty screen, not an error, to a director with no assignments', async () => {
    mockNodosGdv = []
    mockLideres = []
    const props = await renderMiEquipo()
    expect(props.vista).toBeNull()
    expect(props.direcciones).toEqual([])
    expect(props.puedeEditar).toBe(false)
  })

  it('still opens (with the segmento alone) for a director whose team has no groups yet', async () => {
    mockNodosGdv = NODOS_DIRECTOR.slice(0, 3)
    mockLideres = LIDERES_DIRECTOR.slice(0, 1)
    const props = await renderMiEquipo()
    expect(props.direcciones.map((d) => d.id)).toEqual(['seg-1'])
    expect(props.vista?.personas.map((p) => p.nombre)).toEqual(['Diego Etapa'])
  })
})

describe('mi-equipo — a director general without capability', () => {
  const NODOS_DG: NodoEstructuraGdv[] = [
    { nodoId: 'gdv-raiz', parentId: null, tipo: 'direccion', label: 'Dirección de Grupos de Vida', responsables: [] },
    { nodoId: 'seg-1', parentId: 'gdv-raiz', tipo: 'segmento', label: 'Matrimonios', responsables: [] },
    { nodoId: 'seg-2', parentId: 'gdv-raiz', tipo: 'segmento', label: 'Mujeres', responsables: [] },
    { nodoId: 'team-1', parentId: 'seg-1', tipo: 'directores', label: 'Diego Etapa', responsables: [] },
    { nodoId: 'team-2', parentId: 'seg-2', tipo: 'directores', label: 'Dana Etapa', responsables: [] },
    { nodoId: 'grupo-1', parentId: 'team-1', tipo: 'grupo', label: 'Grupo Norte', responsables: [] },
  ]
  const LIDERES_DG: DreamTeamLiderGdv[] = [
    { personaId: personaId('dg'), equipoId: 'seg-1', rol: 'director_general', desde: '2026-05-01T00:00:00.000Z' },
    { personaId: personaId('dg'), equipoId: 'seg-2', rol: 'director_general', desde: '2026-05-01T00:00:00.000Z' },
    { personaId: personaId('de'), equipoId: 'team-1', rol: 'director_etapa', desde: null },
    { personaId: personaId('de2'), equipoId: 'team-2', rol: 'director_etapa', desde: null },
    { personaId: personaId('l1'), equipoId: 'grupo-1', rol: 'lider', desde: '2026-01-01T00:00:00.000Z' },
  ]

  beforeEach(() => {
    mockSession = session(['director-general'])
    mockNodosGdv = NODOS_DG
    mockLideres = LIDERES_DG
  })

  it('offers each of their segmentos as a direccion and honors ?direccion=', async () => {
    const props = await renderMiEquipo()
    expect(props.direcciones.map((d) => d.id)).toEqual(['seg-1', 'seg-2'])
    expect((await renderMiEquipo({ direccion: 'seg-2' })).vista?.label).toBe('Mujeres')
  })

  it('shows the director general at the top of their segmento', async () => {
    const vista = (await renderMiEquipo({ direccion: 'seg-1' })).vista
    expect(vista?.personas[0]).toMatchObject({ nombre: 'Dora General', rolLabel: 'Director general', editable: false })
  })
})

describe('mi-equipo — nobody else is let in', () => {
  it('404s a plain leader, a member and a user with no roles', async () => {
    for (const roles of [['lider'], ['miembro'], ['admin'], []]) {
      mockSession = session(roles)
      await expect(renderMiEquipo()).rejects.toThrow('NEXT_NOT_FOUND')
    }
  })

  it('404s a director when the Dream Team flag is off', async () => {
    mockEnabled = false
    await expect(renderMiEquipo()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects anonymous callers to the login', async () => {
    mockSession = null
    await expect(renderMiEquipo()).rejects.toThrow('NEXT_REDIRECT:/login')
  })
})

describe('mi-equipo — a capability holder sees no change', () => {
  it('keeps the edit flag and the real tree for a holder of org.manage, with or without a director role', async () => {
    mockEquipos = [{ id: 'dir-a', experiencia: 'talleres_crecimiento', label: 'Dirección A', activo: true }]
    mockLideres = []
    mockNodosGdv = []
    for (const roles of [[], ['director-etapa']]) {
      mockSession = session(roles, [orgManage])
      const props = await renderMiEquipo()
      expect(props.puedeEditar).toBe(true)
      expect(props.direcciones.map((d) => d.id)).toEqual(['dir-a'])
    }
  })
})

describe('Servidores and Estructura keep today\'s gate', () => {
  it.each([['director-etapa'], ['director-general']])('404 %s (no capability) on Servidores', async (rol) => {
    mockSession = session([rol])
    await expect(DreamTeamServidoresPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it.each([['director-etapa'], ['director-general']])('404 %s (no capability) on Estructura', async (rol) => {
    mockSession = session([rol])
    await expect(DreamTeamEstructuraPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('does not ask for the roles on those pages (their session is what it was)', async () => {
    mockSession = session(['director-etapa'])
    await expect(DreamTeamServidoresPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(DreamTeamEstructuraPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireDreamTeamSession).not.toHaveBeenCalledWith({ includeRoles: true })
  })
})
