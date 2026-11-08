/**
 * /dream-team (the Equipo tab's root page) for a DPS-only user
 * (odd/tasks/dps-asistencia-pco.md, T9): someone without Mi equipo and
 * without anywhere to register people, but who plans DPS (or sees DPS and
 * coordinates a team), gets the page with the DPS entries instead of a 404.
 * Everyone else keeps the previous guard (__tests__/app/dream-team/dream-team-raiz.test.tsx).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) } }))

const requireDreamTeamSession = jest.fn()
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => true,
  requireDreamTeamSession: (opciones: unknown) => requireDreamTeamSession(opciones),
  hasDreamTeamMiEquipoAccess: () => false,
}))

let respuestas: Record<string, unknown> = {}
const rpc = jest.fn(async (nombre: string) => ({ data: respuestas[nombre] ?? null, error: null }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc }) }))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/components/navegacion/accesos-seccion', () => ({
  AccesosSeccion: ({ seccion }: { seccion: string }) => <div data-testid="accesos" data-seccion={seccion} />,
}))

import DreamTeamPage from '@/app/(auth)/dream-team/page'

const sesion = (capabilities: unknown[] = []) => ({ personaId: 'p1', subjectAuthId: 'a1', globalRoles: [], contexts: [], capabilities })

beforeEach(() => {
  jest.clearAllMocks()
  respuestas = { dream_team_equipos_registrables: [], dream_team_puede_registrar_persona: false }
})

describe('/dream-team for a DPS-only user', () => {
  it('opens for a DPS planner', async () => {
    requireDreamTeamSession.mockResolvedValue(sesion())
    respuestas = { ...respuestas, dps_puede_ver: true, dps_puede_planificar: true }
    render(await DreamTeamPage())
    expect(screen.getByTestId('accesos')).toHaveAttribute('data-seccion', 'dream-team')
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['dps_puede_ver', 'dps_puede_planificar']))
  })

  it('stays a 404 for someone who only serves in DPS', async () => {
    requireDreamTeamSession.mockResolvedValue(sesion())
    respuestas = { ...respuestas, dps_puede_ver: true, dps_puede_planificar: false }
    await expect(DreamTeamPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('stays a 404 without DPS access', async () => {
    requireDreamTeamSession.mockResolvedValue(sesion())
    await expect(DreamTeamPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
