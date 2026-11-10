/**
 * The previous per-role dashboard inside «A tu cargo» and «Visión general»
 * (app/(auth)/dashboard/tablero-anterior.tsx). Ported from
 * __tests__/app/dashboard-page.test.tsx, which tested the same loading when
 * it lived in page.tsx: host-home queues, the campus cookie and the
 * contextual access behind the platform flag keep working.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import type { PlatformSession } from '@/lib/platform/session/types'

const obtenerDatosDashboard = jest.fn()
const obtenerGruposSinCasaAnfitriona = jest.fn()
const obtenerCasasRevisionPendiente = jest.fn()
const mockCampusCookie: { value: string | undefined } = { value: undefined }

jest.mock('@/lib/dashboard/obtenerDatosDashboard', () => ({ obtenerDatosDashboard: (...args: unknown[]) => obtenerDatosDashboard(...args) }))
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'gc_campus_activo' && mockCampusCookie.value !== undefined ? { name, value: mockCampusCookie.value } : undefined),
  }),
}))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  obtenerCasasRevisionPendiente: () => obtenerCasasRevisionPendiente(),
  obtenerGruposSinCasaAnfitriona: (input: unknown) => obtenerGruposSinCasaAnfitriona(input),
}))

type ProbeProps = {
  data: { casas_anfitrionas_queues?: { missingGroups: unknown[]; missingGroupsDegraded?: boolean; pendingReviews: unknown[]; pendingReviewsDegraded?: boolean } }
  rol?: string
  campusInicialId?: string | null
}

function Probe({ data, name }: ProbeProps & { name: string }) {
  const q = data.casas_anfitrionas_queues
  return (
    <section data-testid="role-probe">
      <span>{name}</span>
      <span>missing:{q?.missingGroups.length ?? 'none'}</span>
      <span>pending:{q?.pendingReviews.length ?? 'none'}</span>
      <span>missing-degraded:{String(q?.missingGroupsDegraded ?? false)}</span>
      <span>pending-degraded:{String(q?.pendingReviewsDegraded ?? false)}</span>
    </section>
  )
}

jest.mock('@/components/dashboard/roles/DashboardAdmin', () => ({
  __esModule: true,
  default: (p: ProbeProps) => <Probe {...p} name={`admin:${p.rol} campus:${p.campusInicialId ?? 'none'}`} />,
}))
jest.mock('@/components/dashboard/roles/DashboardDirector', () => ({ __esModule: true, default: (p: ProbeProps) => <Probe {...p} name="director" /> }))
jest.mock('@/components/dashboard/roles/DashboardLider', () => ({ __esModule: true, default: (p: ProbeProps) => <Probe {...p} name="lider" /> }))

import { cargarTableroAnterior, HOST_HOME_QUEUE_FETCH_TIMEOUT_MS } from '@/app/(auth)/dashboard/tablero-anterior'

const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

const GRUPO_LIDER = [{ tipo: 'grupo-lider' as const, grupoId: 'g-1', nombre: 'Hombres +36' }]

async function pintar(opciones: Parameters<typeof cargarTableroAnterior>[0]) {
  const t = await cargarTableroAnterior(opciones)
  render(
    <>
      {t.aCargo && <div data-testid="a-cargo">{t.aCargo}</div>}
      {t.visionGeneral && <div data-testid="vision">{t.visionGeneral}</div>}
    </>,
  )
  return t
}

describe('cargarTableroAnterior', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCampusCookie.value = undefined
    obtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [{ grupo_id: 'group-1' }] })
    obtenerCasasRevisionPendiente.mockResolvedValue({ success: true, data: [{ review_id: 'review-1' }] })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED', originalEnabled)
    restoreEnv('NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH', originalKillSwitch)
  })

  it('admin: el tablero del campus va en Visión general, con las colas de casas', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {}, platformSession: null })

    const t = await pintar({ cargos: null, conVision: true })

    expect(t.aCargo).toBeUndefined()
    expect(obtenerGruposSinCasaAnfitriona).toHaveBeenCalledWith({ scope: 'active' })
    expect(obtenerCasasRevisionPendiente).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('vision')).toHaveTextContent('admin:admin')
    expect(screen.getByTestId('vision')).toHaveTextContent('missing:1')
    expect(screen.getByTestId('vision')).toHaveTextContent('pending:1')
  })

  it('líder: su tablero va en A tu cargo, sin la cola de revisión de casas', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'lider', widgets: {}, platformSession: null })

    const t = await pintar({ cargos: GRUPO_LIDER, conVision: false })

    expect(t.visionGeneral).toBeUndefined()
    expect(obtenerCasasRevisionPendiente).not.toHaveBeenCalled()
    expect(screen.getByTestId('a-cargo')).toHaveTextContent('lider')
    expect(screen.getByTestId('a-cargo')).toHaveTextContent('missing:1')
    expect(screen.getByTestId('a-cargo')).toHaveTextContent('pending:0')
  })

  it('director general: el tablero de sus segmentos va en A tu cargo', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'director-general', widgets: {}, platformSession: null, campusId: null })

    await pintar({ cargos: [{ tipo: 'segmento', segmentoId: 'seg-1' }], conVision: false })

    expect(screen.getByTestId('a-cargo')).toHaveTextContent('admin:director-general campus:none')
  })

  it('director de etapa: su tablero va en A tu cargo', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'director-etapa', widgets: {}, platformSession: null })

    await pintar({ cargos: [{ tipo: 'etapa', directorEtapaId: 'sl-1' }], conVision: false })

    expect(screen.getByTestId('a-cargo')).toHaveTextContent('director')
  })

  it('sin tablero anterior para su cargo enlaza lo que tiene a cargo, sin colas de casas', async () => {
    obtenerDatosDashboard.mockResolvedValue({ rol: 'miembro', widgets: {}, platformSession: null })

    await pintar({ cargos: [{ tipo: 'area-dream-team', equipoId: 'eq-1', servicioId: 's-1' }], conVision: false })

    expect(obtenerGruposSinCasaAnfitriona).not.toHaveBeenCalled()
    expect(screen.queryByTestId('role-probe')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi equipo de Dream Team' })).toHaveAttribute('href', '/dream-team/mi-equipo')
  })

  it('si fallan las colas el tablero sigue, marcado como degradado', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {}, platformSession: null })
    obtenerGruposSinCasaAnfitriona.mockRejectedValue(new Error('queue rpc unavailable'))
    obtenerCasasRevisionPendiente.mockResolvedValue({ success: false, error: 'No autorizado' })

    await pintar({ cargos: null, conVision: true })

    expect(screen.getByTestId('vision')).toHaveTextContent('missing:0')
    expect(screen.getByTestId('vision')).toHaveTextContent('missing-degraded:true')
    expect(screen.getByTestId('vision')).toHaveTextContent('pending-degraded:true')
    expect(consoleError).toHaveBeenCalledWith('Error cargando colas de Casas Anfitrionas:', expect.any(Error))
  })

  it('si las colas no responden a tiempo las marca como degradadas', async () => {
    jest.useFakeTimers()
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {}, platformSession: null })
    obtenerGruposSinCasaAnfitriona.mockReturnValue(new Promise(() => undefined))
    obtenerCasasRevisionPendiente.mockReturnValue(new Promise(() => undefined))

    const promesa = cargarTableroAnterior({ cargos: null, conVision: true })
    await jest.advanceTimersByTimeAsync(HOST_HOME_QUEUE_FETCH_TIMEOUT_MS)
    render(<>{(await promesa).visionGeneral}</>)

    expect(screen.getByTestId('role-probe')).toHaveTextContent('missing-degraded:true')
    expect(screen.getByTestId('role-probe')).toHaveTextContent('pending-degraded:true')
    expect(consoleWarn).toHaveBeenCalledTimes(2)
  })

  it('usa el campus de la cookie solo si es un uuid', async () => {
    const campusId = '3f6c2a1e-8b7d-4c2e-9a1b-5d4e3f2a1b0c'
    mockCampusCookie.value = campusId
    obtenerDatosDashboard.mockResolvedValue({ rol: 'admin', widgets: {}, platformSession: null, campusId })

    await pintar({ cargos: null, conVision: true })

    expect(obtenerDatosDashboard).toHaveBeenCalledWith(campusId)
    expect(screen.getByTestId('vision')).toHaveTextContent(`admin:admin campus:${campusId}`)

    mockCampusCookie.value = 'barquisimeto'
    await cargarTableroAnterior({ cargos: null, conVision: true })
    expect(obtenerDatosDashboard).toHaveBeenLastCalledWith(null)
  })

  it('muestra los contextos visibles detrás de la bandera de plataforma', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = 'true'
    delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
    const platformSession: PlatformSession = {
      personaId: 'persona-1',
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [{ experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', label: 'Grupos de Vida — Adultos' }],
      capabilities: [{ key: 'grupos_vida.stage.read', experience: 'grupos_vida', scopeType: 'etapa', scopeId: 'adultos', source: 'gdv' }],
    }
    obtenerDatosDashboard.mockResolvedValue({ rol: 'lider', widgets: {}, platformSession })

    await pintar({ cargos: GRUPO_LIDER, conVision: false })

    expect(screen.getByRole('heading', { name: 'Contextos visibles' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir Grupos de Vida — Adultos' })).toHaveAttribute('href', '/grupos-vida')
  })
})
