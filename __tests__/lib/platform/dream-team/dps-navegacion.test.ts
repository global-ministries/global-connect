/**
 * DPS entries of the Dream Team menu (odd/tasks/dps-asistencia-pco.md, T9):
 * "Asistencia DPS" for whoever plans, or sees DPS and coordinates or directs
 * some team; "Configuración DPS" for whoever plans (the page turns read-only
 * when the configuration writes say sin_autoridad). The facts come from
 * dps_puede_ver / dps_puede_planificar, resolved once by the (auth) layout
 * (resolverDpsAcceso, fails closed). Without DPS access the items are
 * exactly the previous ones.
 */
import { DREAM_TEAM_NAV_ITEMS, getDreamTeamNavItems, puedeAbrirAsistenciaDps } from '@/lib/platform/dream-team/navigation'
import { resolverDpsAcceso, SIN_ACCESO_DPS } from '@/lib/platform/dream-team/dps/acceso'
import type { PlatformSession } from '@/lib/platform/session/types'

const sesion = (capabilities: PlatformSession['capabilities'] = [], globalRoles: string[] = []): PlatformSession => ({
  personaId: 'p1',
  subjectAuthId: 'a1',
  globalRoles,
  contexts: [],
  capabilities,
})

const cap = (key: string, scopeType = 'equipo'): PlatformSession['capabilities'][number] => ({
  key,
  experience: 'dream_team',
  scopeType,
  scopeId: 'e1',
  source: 'grant',
})

const ids = (items: readonly { id: string }[]) => items.map((i) => i.id)

describe('getDreamTeamNavItems with DPS', () => {
  it('keeps the previous items byte for byte without DPS access', () => {
    const lector = sesion([cap('dream_team.direct')])
    const coordinador = sesion([cap('dream_team.coordinate')])
    const director = sesion([], ['director-general'])
    expect(getDreamTeamNavItems(lector, true)).toBe(DREAM_TEAM_NAV_ITEMS)
    expect(getDreamTeamNavItems(lector, true, { dps: SIN_ACCESO_DPS })).toBe(DREAM_TEAM_NAV_ITEMS)
    expect(getDreamTeamNavItems(coordinador, true, { dps: SIN_ACCESO_DPS })).toEqual(getDreamTeamNavItems(coordinador, true))
    expect(ids(getDreamTeamNavItems(coordinador, true, { dps: SIN_ACCESO_DPS }))).toEqual(['dt-mi-equipo', 'dt-pendientes'])
    expect(ids(getDreamTeamNavItems(director, true, { dps: SIN_ACCESO_DPS }))).toEqual(['dt-mi-equipo'])
    expect(getDreamTeamNavItems(sesion(), true, { dps: SIN_ACCESO_DPS })).toEqual([])
  })

  it('adds both DPS entries for a planner, after the previous items', () => {
    const items = getDreamTeamNavItems(sesion([cap('dream_team.direct')]), true, { dps: { ver: true, planificar: true } })
    expect(ids(items)).toEqual([...ids(DREAM_TEAM_NAV_ITEMS), 'dt-dps-asistencia', 'dt-dps-configuracion'])
    expect(items.slice(-2)).toEqual([
      { id: 'dt-dps-asistencia', label: 'Asistencia DPS', href: '/dream-team/dps/asistencia' },
      { id: 'dt-dps-configuracion', label: 'Configuración DPS', href: '/dream-team/dps/configuracion' },
    ])
  })

  it('gives a DPS coordinator only the attendance', () => {
    const items = getDreamTeamNavItems(sesion([cap('dream_team.coordinate')]), true, { dps: { ver: true, planificar: false } })
    expect(ids(items)).toEqual(['dt-mi-equipo', 'dt-pendientes', 'dt-dps-asistencia'])
  })

  it('gives a planner without any Dream Team grant the DPS entries alone', () => {
    expect(ids(getDreamTeamNavItems(sesion(), true, { dps: { ver: true, planificar: true } }))).toEqual(['dt-dps-asistencia', 'dt-dps-configuracion'])
  })

  it('gives nothing to someone who only serves in DPS', () => {
    expect(getDreamTeamNavItems(sesion(), true, { dps: { ver: true, planificar: false } })).toEqual([])
  })

  it('gives nothing with the flag off or without a session', () => {
    expect(getDreamTeamNavItems(sesion(), false, { dps: { ver: true, planificar: true } })).toEqual([])
    expect(getDreamTeamNavItems(null, true, { dps: { ver: true, planificar: true } })).toEqual([])
  })
})

describe('puedeAbrirAsistenciaDps', () => {
  it('planner, or sees DPS with a coordinate / direct grant somewhere', () => {
    expect(puedeAbrirAsistenciaDps(sesion(), { ver: true, planificar: true })).toBe(true)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.direct')]), { ver: true, planificar: false })).toBe(true)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.coordinate')]), { ver: false, planificar: false })).toBe(false)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.metrics.read', 'experience')]), { ver: true, planificar: false })).toBe(false)
  })
})

describe('resolverDpsAcceso', () => {
  const cliente = (respuestas: Record<string, { data: unknown; error: unknown }>) => ({
    rpc: jest.fn(async (nombre: string) => respuestas[nombre] ?? { data: null, error: null }),
  })

  it('asks dps_puede_ver and dps_puede_planificar', async () => {
    const c = cliente({ dps_puede_ver: { data: true, error: null }, dps_puede_planificar: { data: false, error: null } })
    expect(await resolverDpsAcceso(c, true)).toEqual({ ver: true, planificar: false })
    expect(c.rpc.mock.calls.map((x) => x[0]).sort()).toEqual(['dps_puede_planificar', 'dps_puede_ver'])
  })

  it('fails closed: flag off, no client, an error or a throw', async () => {
    const c = cliente({ dps_puede_ver: { data: true, error: null }, dps_puede_planificar: { data: true, error: null } })
    expect(await resolverDpsAcceso(c, false)).toEqual(SIN_ACCESO_DPS)
    expect(c.rpc).not.toHaveBeenCalled()
    expect(await resolverDpsAcceso(null, true)).toEqual(SIN_ACCESO_DPS)
    expect(await resolverDpsAcceso({}, true)).toEqual(SIN_ACCESO_DPS)
    const conError = cliente({ dps_puede_ver: { data: true, error: { code: 'XX000' } }, dps_puede_planificar: { data: true, error: { code: 'XX000' } } })
    expect(await resolverDpsAcceso(conError, true)).toEqual(SIN_ACCESO_DPS)
  })

  it('a planner always sees DPS', async () => {
    const c = cliente({ dps_puede_ver: { data: null, error: { code: 'XX000' } }, dps_puede_planificar: { data: true, error: null } })
    expect(await resolverDpsAcceso(c, true)).toEqual({ ver: true, planificar: true })
  })
})
