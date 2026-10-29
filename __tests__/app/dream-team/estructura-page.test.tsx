/**
 * /admin/dream-team/estructura (RSC): authorization, the URL state
 * (`?equipo=` — the legacy link — plus q, problema, tab, expandidos), the
 * campus shifts (every own restriction, for "Sin turno"), and the contract
 * that only serializable data reaches the client island.
 *
 * Changed on design system v2 (S12): without `?equipo=` no node opens (the
 * page is the org chart; it used to default to the first dirección with
 * people, which the two-pane detail needed).
 */
import React from 'react'

import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'
import { nivelDesdeLabel } from '@/lib/platform/dream-team/nivel-rol'

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
const hasDreamTeamOrgManageCapability = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: () => requireDreamTeamSession(),
  hasDreamTeamReadCapability: () => hasDreamTeamReadCapability(),
  hasDreamTeamOrgManageCapability: () => hasDreamTeamOrgManageCapability(),
}))

// The island imports the server actions; loading them under jsdom is out of scope for a page test.
jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({}))
jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({}))

const TALLERES = [
  { slug: 'equipo-uno', nombre: 'Taller Uno', dream_team_equipo_id: 'eq-a1' },
  { slug: 'sin-equipo', nombre: 'Sin equipo', dream_team_equipo_id: null },
]
const TURNOS_FILAS = [
  { id: 't9', campus_id: 'c1', nombre: 'Domingo 9:00', dia_semana: 0, hora: '09:00:00', orden: 1, activo: true, tipo: 'semanal' },
]
let mockEquipoTurnos: { equipo_id: string; turno_id: string }[] | null = []
const rpc = jest.fn(async () => ({ data: ['t9'], error: null }))
/** A thenable query that also chains `.eq()` / `.order()`, like supabase-js. */
interface Consulta extends Promise<{ data: unknown; error: unknown }> {
  eq(): Consulta
  order(): Consulta
}
function consulta(data: unknown, error: unknown = null): Consulta {
  return Object.assign(Promise.resolve({ data, error }), { eq: () => consulta(data, error), order: () => consulta(data, error) })
}
const TABLAS: Record<string, () => unknown> = {
  talleres: () => TALLERES,
  dream_team_turnos: () => TURNOS_FILAS,
  campus: () => [{ id: 'c1', nombre: 'Barquisimeto' }],
}
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    rpc,
    from: (tabla: string) => ({
      select: () =>
        tabla === 'dream_team_equipo_turnos'
          ? consulta(mockEquipoTurnos, mockEquipoTurnos ? null : { message: 'rls' })
          : consulta(TABLAS[tabla]?.() ?? []),
    }),
  }),
}))

const EQUIPOS: DreamTeamEquipo[] = [
  { id: 'dir-a', experiencia: 'talleres_crecimiento', label: 'Dirección A', activo: true },
  { id: 'eq-a1', experiencia: 'talleres_crecimiento', label: 'Equipo A1', parentEquipoId: 'dir-a', activo: true },
  { id: 'dir-b', experiencia: 'talleres_crecimiento', label: 'Dirección B', activo: true },
  { id: 'dir-vieja', experiencia: 'talleres_crecimiento', label: 'Dirección Vieja', activo: false },
]
let mockEquipos: DreamTeamEquipo[] = EQUIPOS
let mockServicios: DreamTeamServicio[] = []

const ROLES: DreamTeamRol[] = ['director', 'coordinador', 'facilitador'].map((label) => ({
  id: `rol-${label}`,
  equipoId: 'x',
  label,
  nivel: nivelDesdeLabel(label),
  activo: true,
}))
const servicio = (
  id: string,
  equipoId: string,
  rol: string,
  persona: string,
  estado: DreamTeamServicio['estado'] = 'activo',
): DreamTeamServicio => ({
  id,
  personaId: personaId(persona),
  equipoId,
  rolId: `rol-${rol}`,
  estado,
  fechaInicio: '2026-01-01T00:00:00.000Z',
  motivoActual: 'admin_asignacion',
  version: 1,
})

jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => mockEquipos,
    listServicios: async () => mockServicios,
    listRolesPorEquipo: async () => ROLES,
  }),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => [] }))
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchNombresPersonas: async () =>
    new Map([
      ['p1', 'Ana Directora'],
      ['p2', 'Bea Coordinadora'],
      ['p3', 'Carla Facilitadora'],
    ]),
}))

import DreamTeamEstructuraPage from '@/app/(auth)/admin/dream-team/estructura/page'
import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'

async function renderizar(searchParams?: Record<string, string | string[]>): Promise<EstructuraClientProps> {
  const element = (await DreamTeamEstructuraPage({
    searchParams: Promise.resolve(searchParams ?? {}),
  })) as React.ReactElement<EstructuraClientProps>
  expect(element.type).toBe(EstructuraClient)
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
  mockEquipos = EQUIPOS
  mockEquipoTurnos = [
    { equipo_id: 'eq-a1', turno_id: 't9' },
    { equipo_id: 'dir-b', turno_id: 't9' },
  ]
  rpc.mockClear()
  mockServicios = [
    servicio('s1', 'dir-a', 'director', 'p1'),
    servicio('s2', 'eq-a1', 'coordinador', 'p2'),
    servicio('s3', 'eq-a1', 'facilitador', 'p3', 'retirado'),
  ]
  isDreamTeamEnabled.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue({ personaId: 'viewer' })
  hasDreamTeamReadCapability.mockReturnValue(true)
  hasDreamTeamOrgManageCapability.mockReturnValue(true)
  notFound.mockClear()
  redirect.mockClear()
})

describe('estructura page — authorization', () => {
  it('404s when Dream Team is disabled, redirects anonymous callers, 404s without read capability', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')

    isDreamTeamEnabled.mockReturnValue(true)
    requireDreamTeamSession.mockResolvedValue(null)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/login')

    requireDreamTeamSession.mockResolvedValue({ personaId: 'viewer' })
    hasDreamTeamReadCapability.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('lets only org.manage edit the structure', async () => {
    expect((await renderizar()).puedeEditar).toBe(true)
    hasDreamTeamOrgManageCapability.mockReturnValue(false)
    expect((await renderizar()).puedeEditar).toBe(false)
  })
})

describe('estructura page — URL state', () => {
  it('opens no node without ?equipo=', async () => {
    const props = await renderizar()
    expect(props.equipoId).toBe('')
    expect(props.filtros?.equipo).toBeNull()
  })

  it('takes the equipo from the URL, the first one when repeated', async () => {
    expect((await renderizar({ equipo: 'eq-a1' })).equipoId).toBe('eq-a1')
    expect((await renderizar({ equipo: ['eq-a1', 'dir-b'] })).equipoId).toBe('eq-a1')
  })

  it('accepts an inactive root from the URL', async () => {
    expect((await renderizar({ equipo: 'dir-vieja' })).equipoId).toBe('dir-vieja')
  })

  it('opens nothing for an unknown equipo', async () => {
    const props = await renderizar({ equipo: 'no-existe' })
    expect(props.equipoId).toBe('')
    expect(props.filtros?.equipo).toBeNull()
  })

  it('hands the search, the problem pill, the tab and the open branches to the island, dropping invalid values', async () => {
    const props = await renderizar({ equipo: 'eq-a1', q: ' Uno ', problema: 'sin_turno', tab: 'turnos', expandidos: 'dir-a,dir-b' })
    expect(props.filtros).toEqual({ equipo: 'eq-a1', q: 'Uno', problema: 'sin_turno', tab: 'turnos', expandidos: ['dir-a', 'dir-b'] })
    expect((await renderizar({ problema: 'otro', tab: 'x' })).filtros).toMatchObject({ problema: null, tab: 'equipos', expandidos: null })
  })

  it('has no equipo at all when the caller reaches nothing', async () => {
    mockEquipos = []
    const props = await renderizar()
    expect(props.equipoId).toBe('')
    expect(props.arbol).toEqual([])
  })
})

describe('estructura page — campus shifts', () => {
  it('loads every own restriction once, for "Sin turno" on the chart', async () => {
    const props = await renderizar()
    expect(props.turnos?.propiosPorEquipo).toEqual({ 'eq-a1': ['t9'], 'dir-b': ['t9'] })
    expect(props.turnos?.campus).toEqual([{ id: 'c1', nombre: 'Barquisimeto' }])
    expect(props.turnos?.delEquipo).toBeUndefined()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('resolves the shifts of the open node: its own and the effective ones', async () => {
    const props = await renderizar({ equipo: 'eq-a1' })
    expect(props.turnos?.delEquipo).toEqual({ equipoId: 'eq-a1', propios: ['t9'], efectivos: ['t9'] })
    expect(rpc).toHaveBeenCalledWith('dream_team_turnos_del_equipo', { p_equipo_id: 'eq-a1', p_campus_id: 'c1' })
  })

  it('leaves the shifts out when they cannot be read', async () => {
    mockEquipoTurnos = null
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect((await renderizar()).turnos).toBeUndefined()
    error.mockRestore()
  })
})

describe('estructura page — data for the island', () => {
  it('counts non-retired people, maps each taller to its link and keeps responsables on the tree', async () => {
    const props = await renderizar()
    expect(props.uso.propias).toEqual({ 'dir-a': 1, 'eq-a1': 1 })
    expect(props.talleres).toEqual({ 'eq-a1': { href: '/talleres/equipo-uno', nombre: 'Taller Uno' } })
    const equipoA1 = props.arbol[0].hijos[0].equipo
    expect(equipoA1.responsables.map((r) => [r.nombre, r.rol])).toEqual([['Bea Coordinadora', 'coordinador']])
  })

  it('hands the island only serializable data', async () => {
    const props = await renderizar({ equipo: 'eq-a1' })
    expect(esSerializable(props)).toBe(true)
  })
})
