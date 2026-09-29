/**
 * /dream-team/mi-equipo (RSC): authorization, direccion resolution from the
 * URL, and the contract that only serializable data reaches the client island.
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
const hasDreamTeamWriteCapability = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: () => requireDreamTeamSession(),
  hasDreamTeamReadCapability: () => hasDreamTeamReadCapability(),
  hasDreamTeamWriteCapability: () => hasDreamTeamWriteCapability(),
}))

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))

const EQUIPOS: DreamTeamEquipo[] = [
  { id: 'dir-a', experiencia: 'talleres_crecimiento', label: 'Dirección A', activo: true },
  { id: 'eq-a1', experiencia: 'talleres_crecimiento', label: 'Equipo A1', parentEquipoId: 'dir-a', activo: true },
  { id: 'dir-b', experiencia: 'talleres_crecimiento', label: 'Dirección B', activo: true },
  { id: 'eq-b1', experiencia: 'talleres_crecimiento', label: 'Equipo B1', parentEquipoId: 'dir-b', activo: true },
  { id: 'dir-vacia', experiencia: 'talleres_crecimiento', label: 'Dirección Vacía', activo: true },
]
let mockEquipos: DreamTeamEquipo[] = EQUIPOS

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
  version: 3,
})
const SERVICIOS = [
  servicio('s1', 'dir-a', 'director', 'p1'),
  servicio('s2', 'eq-a1', 'coordinador', 'p2'),
  servicio('s3', 'eq-a1', 'facilitador', 'p3', 'en_orientacion'),
  servicio('s4', 'eq-b1', 'coordinador', 'p4'),
]

jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({
    listEquipos: async () => mockEquipos,
    listServicios: async () => SERVICIOS,
    listRolesPorEquipo: async () => ROLES,
  }),
}))
jest.mock('@/lib/platform/dream-team/estructura-gdv', () => ({ fetchEstructuraGdv: async () => [] }))
jest.mock('@/lib/platform/dream-team/lideres-gdv', () => ({
  fetchLideresGdv: async () => [{ personaId: 'p9', equipoId: 'eq-a1', rol: 'lider', desde: '2026-01-01' }],
}))
jest.mock('@/lib/platform/dream-team/personas', () => ({
  fetchNombresPersonas: async () =>
    new Map([
      ['p1', 'Ana Directora'],
      ['p2', 'Bea Coordinadora'],
      ['p3', 'Carla Facilitadora'],
      ['p4', 'Dora Otra'],
      ['p9', 'Lidia Lider'],
    ]),
}))

import DreamTeamMiEquipoPage from '@/app/(auth)/dream-team/mi-equipo/page'
import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'

async function renderizar(searchParams?: { direccion?: string | string[] }): Promise<MiEquipoClientProps> {
  const element = (await DreamTeamMiEquipoPage({
    searchParams: Promise.resolve(searchParams ?? {}),
  })) as React.ReactElement<MiEquipoClientProps>
  expect(element.type).toBe(MiEquipoClient)
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
  isDreamTeamEnabled.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue({ personaId: 'viewer' })
  hasDreamTeamReadCapability.mockReturnValue(true)
  hasDreamTeamWriteCapability.mockReturnValue(true)
  notFound.mockClear()
  redirect.mockClear()
})

describe('mi-equipo page — authorization', () => {
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
})

describe('mi-equipo page — direccion resolution', () => {
  it('defaults to the first direccion with people and lists the visible ones', async () => {
    const props = await renderizar()
    expect(props.direccionId).toBe('dir-a')
    expect(props.direcciones.map((d) => d.id)).toEqual(['dir-a', 'dir-b'])
    expect(props.vista?.label).toBe('Dirección A')
  })

  it('shows a single direccion to someone whose branch is one', async () => {
    mockEquipos = EQUIPOS.filter((e) => e.id === 'dir-a' || e.parentEquipoId === 'dir-a')
    const props = await renderizar()
    expect(props.direcciones.map((d) => d.id)).toEqual(['dir-a'])
  })

  it('honours ?direccion= when it is a visible direccion', async () => {
    const props = await renderizar({ direccion: 'dir-b' })
    expect(props.direccionId).toBe('dir-b')
    expect(props.vista?.equipos.map((e) => e.label)).toEqual(['Equipo B1'])
  })

  it.each([['dir-vacia'], ['inventada'], ['eq-a1']])('falls back to the default for %s', async (direccion) => {
    expect((await renderizar({ direccion })).direccionId).toBe('dir-a')
  })

  it('takes the first value when the param is repeated', async () => {
    expect((await renderizar({ direccion: ['dir-b', 'dir-a'] })).direccionId).toBe('dir-b')
  })

  it('merges Grupos de Vida leaders as read-only people', async () => {
    const lider = (await renderizar()).vista?.personas.find((p) => p.nombre === 'Lidia Lider')
    expect(lider).toMatchObject({ editable: false, origen: 'grupos_vida', rolLabel: 'Líder de grupo', estado: 'activo' })
  })

  it('passes the write flag, the assignable equipos of the direccion and their roles', async () => {
    const props = await renderizar({ direccion: 'dir-a' })
    expect(props.puedeEditar).toBe(true)
    expect(props.equiposAsignables.map((e) => e.id)).toEqual(['dir-a', 'eq-a1'])
    expect(Object.keys(props.rolesPorEquipo).sort()).toEqual(['dir-a', 'eq-a1'])

    hasDreamTeamWriteCapability.mockReturnValue(false)
    expect((await renderizar()).puedeEditar).toBe(false)
  })

  it('shows an empty screen when nothing is reachable', async () => {
    mockEquipos = []
    const props = await renderizar()
    expect(props.vista).toBeNull()
    expect(props.direcciones).toEqual([])
  })
})

describe('mi-equipo page — RSC boundary', () => {
  it('hands the client island serializable data only', async () => {
    expect(esSerializable(await renderizar())).toBe(true)
    expect(esSerializable(await renderizar({ direccion: 'dir-b' }))).toBe(true)
  })
})
