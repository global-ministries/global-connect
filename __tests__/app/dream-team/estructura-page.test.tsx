/**
 * /admin/dream-team/estructura (RSC): authorization, equipo resolution from
 * the URL, and the contract that only serializable data reaches the client
 * island.
 */
import React from 'react'

import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio } from '@/lib/platform/dream-team/types'
import { personaId } from '@/lib/platform/dream-team/types'

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

const TALLERES = [
  { slug: 'equipo-uno', nombre: 'Taller Uno', dream_team_equipo_id: 'eq-a1' },
  { slug: 'sin-equipo', nombre: 'Sin equipo', dream_team_equipo_id: null },
]
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ select: async () => ({ data: TALLERES }) }),
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

async function renderizar(searchParams?: { equipo?: string | string[] }): Promise<EstructuraClientProps> {
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

describe('estructura page — equipo resolution', () => {
  it('defaults to the first active root with people', async () => {
    expect((await renderizar()).equipoId).toBe('dir-a')
  })

  it('takes the equipo from the URL, the first one when repeated', async () => {
    expect((await renderizar({ equipo: 'eq-a1' })).equipoId).toBe('eq-a1')
    expect((await renderizar({ equipo: ['eq-a1', 'dir-b'] })).equipoId).toBe('eq-a1')
  })

  it('accepts an inactive root from the URL', async () => {
    expect((await renderizar({ equipo: 'dir-vieja' })).equipoId).toBe('dir-vieja')
  })

  it('falls back to the default for an unknown equipo', async () => {
    expect((await renderizar({ equipo: 'no-existe' })).equipoId).toBe('dir-a')
  })

  it('has no equipo at all when the caller reaches nothing', async () => {
    mockEquipos = []
    const props = await renderizar()
    expect(props.equipoId).toBe('')
    expect(props.arbol).toEqual([])
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
