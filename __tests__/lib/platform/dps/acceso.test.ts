/**
 * DPS access facts for the navigation (odd/tasks/dps-asistencia-pco.md, T9):
 * dps_puede_ver / dps_puede_planificar, resolved once by the (auth) layout
 * (resolverDpsAcceso, fails closed), and the attendance rule of the "DPS"
 * menu section (components/dps/dps-menu-item.ts).
 */
import { puedeAbrirAsistenciaDps, resolverDpsAcceso, SIN_ACCESO_DPS } from '@/lib/platform/dps/acceso'
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
  scopeId: 'e1',
  source: 'grant',
})

describe('puedeAbrirAsistenciaDps', () => {
  it('planner, or sees DPS with a coordinate / direct grant somewhere', () => {
    expect(puedeAbrirAsistenciaDps(sesion(), { ver: true, planificar: true })).toBe(true)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.direct')]), { ver: true, planificar: false })).toBe(true)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.coordinate')]), { ver: true, planificar: false })).toBe(true)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.coordinate')]), { ver: false, planificar: false })).toBe(false)
    expect(puedeAbrirAsistenciaDps(sesion([cap('dream_team.metrics.read', 'experience')]), { ver: true, planificar: false })).toBe(false)
    expect(puedeAbrirAsistenciaDps(sesion(), { ver: true, planificar: false })).toBe(false)
  })

  it('is false without a session', () => {
    expect(puedeAbrirAsistenciaDps(null, { ver: true, planificar: true })).toBe(false)
    expect(puedeAbrirAsistenciaDps(undefined, { ver: true, planificar: true })).toBe(false)
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
