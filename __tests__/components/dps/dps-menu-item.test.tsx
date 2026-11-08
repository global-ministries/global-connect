/**
 * The "DPS" menu section (odd/tasks/dps-asistencia-pco.md, T9, L29): its own
 * ministry under Ministerios, like Niños and Estudiantes, built from the
 * server-fed facts of hooks/useDpsAcceso (dps_puede_ver / dps_puede_planificar,
 * resolved by the (auth) layout) and the session's grants. "Plan" (T10) first
 * and "Programación" (T11) after it for whoever sees DPS; "Asistencia" for whoever plans, or sees DPS and
 * coordinates or directs some team; "Configuración" for whoever plans; no
 * section when none shows.
 */
import React, { type ReactNode } from 'react'
import { renderHook } from '@testing-library/react'

import { buildDpsMenuItem, getDpsNavItems, insertDpsMenuItem, useDpsMenuItem } from '@/components/dps/dps-menu-item'
import { DpsAccesoProvider, useDpsAcceso } from '@/hooks/useDpsAcceso'
import { SIN_ACCESO_DPS, type DpsAcceso } from '@/lib/platform/dps/acceso'
import type { PlatformSession } from '@/lib/platform/session/types'

const sesion = (capabilities: PlatformSession['capabilities'] = []): PlatformSession => ({
  personaId: 'p1',
  subjectAuthId: 'a1',
  globalRoles: [],
  contexts: [],
  capabilities,
})

const cap = (key: string, scopeType = 'equipo'): PlatformSession['capabilities'][number] => ({
  key,
  experience: 'dream_team',
  scopeType,
  scopeId: 'audio',
  source: 'grant',
})

const PLANIFICA: DpsAcceso = { ver: true, planificar: true }
const VE: DpsAcceso = { ver: true, planificar: false }

const entradas = (acceso: DpsAcceso, session: PlatformSession | null) =>
  getDpsNavItems(acceso, session).map((hija) => [hija.label, hija.href])

describe('getDpsNavItems', () => {
  it.each<[string, DpsAcceso, PlatformSession | null, string[][]]>([
    [
      'a planner, without any Dream Team grant',
      PLANIFICA,
      sesion(),
      [['Plan', '/dps/plan'], ['Programación', '/dps/programacion'], ['Asistencia', '/dps/asistencia'], ['Configuración', '/dps/configuracion']],
    ],
    ['a DPS coordinator with a coordinate grant', VE, sesion([cap('dream_team.coordinate')]), [['Plan', '/dps/plan'], ['Programación', '/dps/programacion'], ['Asistencia', '/dps/asistencia']]],
    ['a DPS director with a direct grant', VE, sesion([cap('dream_team.direct')]), [['Plan', '/dps/plan'], ['Programación', '/dps/programacion'], ['Asistencia', '/dps/asistencia']]],
    ['a plain DPS servidor', VE, sesion(), [['Plan', '/dps/plan'], ['Programación', '/dps/programacion']]],
    ['a DPS servidor with an unrelated grant', VE, sesion([cap('dream_team.metrics.read', 'experience')]), [['Plan', '/dps/plan'], ['Programación', '/dps/programacion']]],
    ['a coordinator who does not see DPS', SIN_ACCESO_DPS, sesion([cap('dream_team.coordinate')]), []],
    ['a non-DPS user', SIN_ACCESO_DPS, sesion(), []],
    ['no session', PLANIFICA, null, []],
  ])('gives %s %j', (_caso, acceso, session, esperadas) => {
    expect(entradas(acceso, session)).toEqual(esperadas)
  })

  it('carries an icon per entry', () => {
    const items = getDpsNavItems(PLANIFICA, sesion())
    expect(items.map((hija) => hija.id)).toEqual(['dps-plan', 'dps-programacion', 'dps-asistencia', 'dps-configuracion'])
    expect(items.every((hija) => hija.icon !== undefined)).toBe(true)
    expect(new Set(items.map((hija) => hija.icon)).size).toBe(4)
  })
})

describe('buildDpsMenuItem', () => {
  it('is null when no entry shows', () => {
    expect(buildDpsMenuItem(getDpsNavItems(SIN_ACCESO_DPS, sesion([cap('dream_team.coordinate')])))).toBeNull()
    expect(buildDpsMenuItem([])).toBeNull()
  })

  it('opens on its first entry, the plan', () => {
    expect(buildDpsMenuItem(getDpsNavItems(PLANIFICA, sesion()))).toMatchObject({ id: 'dps', label: 'DPS', href: '/dps/plan' })
    const item = buildDpsMenuItem(getDpsNavItems(VE, sesion([cap('dream_team.coordinate')])))
    expect(item).toMatchObject({ id: 'dps', label: 'DPS', href: '/dps/plan' })
    expect(item?.icon).toBeDefined()
    expect(item?.children.map((hija) => hija.id)).toEqual(['dps-plan', 'dps-programacion', 'dps-asistencia'])
    expect(buildDpsMenuItem(getDpsNavItems(VE, sesion()))?.children.map((hija) => hija.id)).toEqual(['dps-plan', 'dps-programacion'])
  })
})

describe('insertDpsMenuItem', () => {
  const item = { id: 'dps' }
  const ids = (lista: readonly { id: string }[]) => lista.map((x) => x.id)

  it('goes right after Estudiantes, else Niños, else Dream Team, else Grupos de Vida, else last', () => {
    expect(ids(insertDpsMenuItem([{ id: 'grupos-vida' }, { id: 'dream-team' }, { id: 'ninos' }, { id: 'estudiantes' }, { id: 'x' }], item))).toEqual([
      'grupos-vida', 'dream-team', 'ninos', 'estudiantes', 'dps', 'x',
    ])
    expect(ids(insertDpsMenuItem([{ id: 'grupos-vida' }, { id: 'dream-team' }, { id: 'ninos' }, { id: 'x' }], item))).toEqual([
      'grupos-vida', 'dream-team', 'ninos', 'dps', 'x',
    ])
    expect(ids(insertDpsMenuItem([{ id: 'grupos-vida' }, { id: 'dream-team' }, { id: 'x' }], item))).toEqual(['grupos-vida', 'dream-team', 'dps', 'x'])
    expect(ids(insertDpsMenuItem([{ id: 'grupos-vida' }, { id: 'x' }], item))).toEqual(['grupos-vida', 'dps', 'x'])
    expect(ids(insertDpsMenuItem([{ id: 'x' }], item))).toEqual(['x', 'dps'])
    expect(ids(insertDpsMenuItem([{ id: 'x' }], null))).toEqual(['x'])
  })
})

describe('useDpsAcceso / useDpsMenuItem', () => {
  const con = (acceso: DpsAcceso) =>
    function Envoltorio({ children }: { children: ReactNode }) {
      return <DpsAccesoProvider acceso={acceso}>{children}</DpsAccesoProvider>
    }

  it('has no access outside the provider', () => {
    expect(renderHook(() => useDpsAcceso()).result.current).toEqual(SIN_ACCESO_DPS)
    expect(renderHook(() => useDpsMenuItem(sesion([cap('dream_team.coordinate')]))).result.current).toBeNull()
  })

  it('builds the section from the provided facts and the session', () => {
    const planificador = renderHook(() => useDpsMenuItem(sesion()), { wrapper: con(PLANIFICA) })
    expect(planificador.result.current?.children.map((hija) => hija.label)).toEqual(['Plan', 'Programación', 'Asistencia', 'Configuración'])
    const coordinador = renderHook(() => useDpsMenuItem(sesion([cap('dream_team.coordinate')])), { wrapper: con(VE) })
    expect(coordinador.result.current?.children.map((hija) => hija.label)).toEqual(['Plan', 'Programación', 'Asistencia'])
    expect(renderHook(() => useDpsMenuItem(sesion()), { wrapper: con(VE) }).result.current?.children.map((hija) => hija.label)).toEqual(['Plan', 'Programación'])
    expect(renderHook(() => useDpsMenuItem(sesion()), { wrapper: con(SIN_ACCESO_DPS) }).result.current).toBeNull()
    expect(renderHook(() => useDpsMenuItem(null), { wrapper: con(PLANIFICA) }).result.current).toBeNull()
  })
})
