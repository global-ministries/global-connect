/**
 * "Cambiar de área" (odd/tasks/dream-team-cambiar-area.md, T2): Servidores and
 * Mi equipo mark a servicio `areaCambiable` only where the viewer has director
 * authority over its equipo (dream_team_autoridad_director) and the servicio is
 * not retired. A coordinator, whom the RPC answers false, gets none. Mi equipo
 * also hands the requests (dream_team_solicitudes_cambio_area()) to its island.
 */
import React from 'react'

import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => true,
  requireDreamTeamSession: async () => ({ personaId: 'me' }),
  hasDreamTeamReadCapability: () => true,
  hasDreamTeamWriteCapability: () => true,
  hasDreamTeamMiEquipoAccess: () => true,
}))

// The equipos the viewer directs; dream_team_autoridad_director answers from it.
let mockDirigidos = new Set<string>()
let mockSolicitudes: unknown = []
const rpc = jest.fn(async (fn: string, args?: { p_equipo_id?: string }) => {
  if (fn === 'dream_team_autoridad_director') return { data: mockDirigidos.has(args?.p_equipo_id ?? ''), error: null }
  if (fn === 'dream_team_solicitudes_cambio_area') return { data: mockSolicitudes, error: null }
  return { data: [], error: null }
})
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc }) }))
jest.mock('@/lib/platform/dream-team/turnos', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/turnos'),
  fetchTurnos: async () => [],
  fetchTurnosDeServicios: async () => new Map(),
  fetchFrecuenciasDeServicios: async () => new Map(),
}))

const EQUIPOS: DreamTeamEquipo[] = [
  { id: 'dir-a', experiencia: 'dps', label: 'DPS', activo: true },
  { id: 'eq-cam', experiencia: 'dps', label: 'Cámaras', parentEquipoId: 'dir-a', activo: true },
  { id: 'eq-est', experiencia: 'dps', label: 'Estacionamiento', parentEquipoId: 'dir-a', activo: true },
]
const ROLES: DreamTeamRol[] = [{ id: 'rol-vol', equipoId: 'x', label: 'Voluntario', nivel: 'voluntario', activo: true }]
const servicio = (id: string, equipoId: string, persona: string, estado: DreamTeamServicio['estado'] = 'activo'): DreamTeamServicio => ({
  id,
  personaId: personaId(persona),
  equipoId,
  rolId: 'rol-vol',
  estado,
  fechaInicio: '2026-01-01T00:00:00.000Z',
  motivoActual: 'admin_asignacion',
  version: 1,
})
const SERVICIOS = [servicio('s1', 'eq-cam', 'p1'), servicio('s2', 'eq-cam', 'p2', 'retirado'), servicio('s3', 'eq-est', 'p3')]

jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => EQUIPOS,
    listServicios: async () => SERVICIOS,
    listRolesPorEquipo: async () => ROLES,
  }),
}))
jest.mock('@/lib/platform/dream-team/edad', () => ({
  ...jest.requireActual('@/lib/platform/dream-team/edad'),
  fetchRangosEdad: async () => new Map(),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => [] }))
jest.mock('@/lib/platform/dream-team/lideres-gdv', () => ({ fetchLideresGdv: async () => [] }))
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchContactosPersonas: async () => new Map(),
  fetchNombresPersonas: async () => new Map([['p1', 'Ana Cámaras'], ['p2', 'Bea Retirada'], ['p3', 'Carla Estacionamiento']]),
}))

import DreamTeamServidoresPage from '@/app/(auth)/admin/dream-team/servidores/page'
import DreamTeamMiEquipoPage from '@/app/(auth)/dream-team/mi-equipo/page'
import type { ServidoresClientProps } from '@/components/dream-team/servidores/servidores-client'
import type { MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'

async function filasServidores(): Promise<Record<string, boolean | undefined>> {
  const element = (await DreamTeamServidoresPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<ServidoresClientProps>
  return Object.fromEntries(element.props.filas.map((fila) => [fila.clave, fila.areaCambiable]))
}

async function personasMiEquipo(): Promise<Record<string, boolean | undefined>> {
  const element = (await DreamTeamMiEquipoPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<MiEquipoClientProps>
  return Object.fromEntries((element.props.vista?.personas ?? []).map((p) => [p.clave, p.areaCambiable]))
}

beforeEach(() => {
  rpc.mockClear()
  mockDirigidos = new Set()
  mockSolicitudes = []
})

describe('Servidores — areaCambiable', () => {
  it('marks the non-retired servicios of the equipos the viewer directs', async () => {
    mockDirigidos = new Set(['eq-cam'])
    expect(await filasServidores()).toEqual({ s1: true, s2: false, s3: false })
  })

  it('asks the authority once per equipo', async () => {
    await filasServidores()
    const equipos = rpc.mock.calls.filter(([fn]) => fn === 'dream_team_autoridad_director').map(([, args]) => args?.p_equipo_id)
    expect(equipos.sort()).toEqual(['eq-cam', 'eq-est'])
  })

  it('a coordinator (no director authority) gets none', async () => {
    expect(await filasServidores()).toEqual({ s1: false, s2: false, s3: false })
  })
})

describe('Mi equipo — areaCambiable', () => {
  it('marks the non-retired servicios of the equipos the viewer directs', async () => {
    mockDirigidos = new Set(['eq-cam', 'eq-est'])
    expect(await personasMiEquipo()).toEqual({ s1: true, s2: false, s3: true })
  })

  it('a coordinator gets none', async () => {
    expect(await personasMiEquipo()).toEqual({ s1: false, s2: false, s3: false })
  })
})

describe('Mi equipo — the cambio-de-área requests', () => {
  it('hands the requests of the read RPC to the island', async () => {
    mockSolicitudes = [{ id: 'sol-1', estado: 'pendiente', motivo: 'traslado', puede_resolver: true, es_mia: false, persona_nombre: 'Ana Cámaras' }]
    const element = (await DreamTeamMiEquipoPage({ searchParams: Promise.resolve({}) })) as React.ReactElement<MiEquipoClientProps>
    expect(element.props.solicitudesCambioArea).toEqual([
      expect.objectContaining({ id: 'sol-1', estado: 'pendiente', puedeResolver: true, personaNombre: 'Ana Cámaras' }),
    ])
  })
})
