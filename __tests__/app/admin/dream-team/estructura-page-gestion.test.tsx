/**
 * /admin/dream-team/estructura (RSC) — which equipos the viewer may reshape
 * (odd/tasks/dream-team-estructura-correcciones.md, T6, S4/S5): an admin or a
 * pastor gets every equipo even without a Dream Team grant, the same rule as
 * dream_team_gestiona_equipo; a scoped director only their branch; anyone
 * else none. requireDreamTeamSession mirrors production: the session carries
 * the system roles only when `includeRoles` is passed.
 */
import React from 'react'

import type { DreamTeamEquipo } from '@/lib/platform/dream-team/types'

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

interface SesionPrueba {
  readonly personaId: string
  readonly capabilities: readonly { readonly key: string; readonly scopeId?: string }[]
  readonly globalRoles: readonly string[]
}
let mockSesion: SesionPrueba
const requireDreamTeamSession = jest.fn(async (options?: { includeRoles?: boolean }) => ({
  ...mockSesion,
  globalRoles: options?.includeRoles ? mockSesion.globalRoles : [],
}))
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => true,
  requireDreamTeamSession: (options?: { includeRoles?: boolean }) => requireDreamTeamSession(options),
  hasDreamTeamReadCapability: () => true,
  hasDreamTeamOrgManageCapability: () => false,
}))

// The island imports the server actions; loading them under jsdom is out of scope for a page test.
jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({}))
jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({}))

/** A thenable query that also chains `.eq()` / `.order()`, like supabase-js. */
interface Consulta extends Promise<{ data: unknown; error: unknown }> {
  eq(): Consulta
  order(): Consulta
}
function consulta(data: unknown): Consulta {
  return Object.assign(Promise.resolve({ data, error: null }), { eq: () => consulta(data), order: () => consulta(data) })
}
let mockAnclas: { data: unknown; error: unknown } = { data: [], error: null }
const rpc = jest.fn(async (fn: string) => (fn === 'dream_team_equipos_anclas_dps' ? mockAnclas : { data: [], error: null }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string) => rpc(fn),
    from: () => ({ select: () => consulta([]) }),
  }),
}))

const EQUIPOS: DreamTeamEquipo[] = [
  { id: 'dir-a', experiencia: 'dps', label: 'Dirección A', activo: true },
  { id: 'eq-a1', experiencia: 'dps', label: 'Equipo A1', parentEquipoId: 'dir-a', activo: true },
  { id: 'dir-b', experiencia: 'dps', label: 'Dirección B', activo: true },
]
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => EQUIPOS,
    listServicios: async () => [],
    listRoles: async () => [],
  }),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => [] }))
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchPartesNombresPersonas: async () => new Map(),
  nombresDesdePartes: () => new Map(),
}))

import DreamTeamEstructuraPage from '@/app/(auth)/admin/dream-team/estructura/page'
import type { EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'

async function gestionables(): Promise<readonly string[] | undefined> {
  const element = (await DreamTeamEstructuraPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<EstructuraClientProps>
  return element.props.equiposGestionables
}

beforeEach(() => {
  requireDreamTeamSession.mockClear()
  rpc.mockClear()
  mockAnclas = { data: [], error: null }
})

async function props(): Promise<EstructuraClientProps> {
  const element = (await DreamTeamEstructuraPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<EstructuraClientProps>
  return element.props
}

// T7 (B2): the DPS anchors cannot be renamed, moved nor deactivated, so the
// island hides those actions on them; the ids come from dream_team_equipos_anclas_dps.
describe('estructura page — DPS anchors', () => {
  it('hands the anchor ids to the island when the viewer reshapes some equipo', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [{ key: 'dream_team.direct', scopeId: 'dir-a' }], globalRoles: [] }
    mockAnclas = { data: ['dir-a'], error: null }
    expect((await props()).anclasDps).toEqual(['dir-a'])
    expect(rpc).toHaveBeenCalledWith('dream_team_equipos_anclas_dps')
  })

  it('hands none when they cannot be read (the RPCs still refuse)', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [], globalRoles: ['admin'] }
    mockAnclas = { data: null, error: { message: 'boom' } }
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await props()).anclasDps).toEqual([])
    consola.mockRestore()
  })

  it('does not ask for them when the viewer reshapes nothing', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [{ key: 'dream_team.read' }], globalRoles: [] }
    expect((await props()).anclasDps).toEqual([])
    expect(rpc).not.toHaveBeenCalledWith('dream_team_equipos_anclas_dps')
  })
})

describe('estructura page — equipos the viewer may reshape', () => {
  it('loads the system roles of the session', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [], globalRoles: [] }
    await gestionables()
    expect(requireDreamTeamSession).toHaveBeenCalledWith({ includeRoles: true })
  })

  it.each(['admin', 'pastor'])('gives an %s without a Dream Team grant every equipo', async (rol) => {
    mockSesion = { personaId: 'viewer', capabilities: [{ key: 'dream_team.read' }], globalRoles: [rol] }
    expect(await gestionables()).toEqual(['dir-a', 'eq-a1', 'dir-b'])
  })

  it('keeps a scoped director to their branch', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [{ key: 'dream_team.direct', scopeId: 'dir-a' }], globalRoles: [] }
    expect(await gestionables()).toEqual(['dir-a', 'eq-a1'])
  })

  it('gives anyone else none', async () => {
    mockSesion = { personaId: 'viewer', capabilities: [{ key: 'dream_team.read' }], globalRoles: ['lider'] }
    expect(await gestionables()).toEqual([])
  })
})
