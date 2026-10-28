/**
 * /dream-team (RSC), the Equipo tab's root page (odd/tasks/sistema-diseno-v2.md,
 * L21 and T8d2): the same guard as Mi equipo — whoever opens no Dream Team page
 * gets a 404 — and, for everyone else, the list of the Dream Team pages the
 * navigation shows them (components/navegacion/accesos-seccion.tsx).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
const requireDreamTeamSession = jest.fn()
const hasDreamTeamMiEquipoAccess = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: (opciones: unknown) => requireDreamTeamSession(opciones),
  hasDreamTeamMiEquipoAccess: () => hasDreamTeamMiEquipoAccess(),
}))

// dream_team_equipos_registrables: `null` = the lookup fails (no rpc at all).
let mockRegistrables: { equipo_id: string }[] | null = null
const rpc = jest.fn(async () => ({ data: mockRegistrables, error: null }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => (mockRegistrables === null ? {} : { rpc }),
}))

// The real header loads lazily; the page only hands it the title.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))
jest.mock('@/components/navegacion/accesos-seccion', () => ({
  AccesosSeccion: ({ seccion }: { seccion: string }) => <div data-testid="accesos" data-seccion={seccion} />,
}))

import DreamTeamPage, { metadata } from '@/app/(auth)/dream-team/page'

const session = { personaId: 'persona-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }

async function renderPagina() {
  render(await DreamTeamPage())
}

beforeEach(() => {
  jest.clearAllMocks()
  isDreamTeamEnabled.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue(session)
  hasDreamTeamMiEquipoAccess.mockReturnValue(true)
  mockRegistrables = null
})

describe('/dream-team', () => {
  it('is titled "Dream Team" and lists the Dream Team pages', async () => {
    await renderPagina()

    expect(metadata).toEqual({ title: 'Dream Team' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Dream Team' })).toBeInTheDocument()
    expect(screen.getByTestId('accesos')).toHaveAttribute('data-seccion', 'dream-team')
    // Asks for the roles: a Grupos de Vida director opens Mi equipo by system role.
    expect(requireDreamTeamSession).toHaveBeenCalledWith({ includeRoles: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('is a 404 with Dream Team off', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(renderPagina()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requireDreamTeamSession).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor to /login', async () => {
    requireDreamTeamSession.mockResolvedValue(null)
    await expect(renderPagina()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('is a 404 for whoever opens no Dream Team page', async () => {
    hasDreamTeamMiEquipoAccess.mockReturnValue(false)
    mockRegistrables = []
    await expect(renderPagina()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('is a 404 when the registrable lookup fails (fails closed)', async () => {
    hasDreamTeamMiEquipoAccess.mockReturnValue(false)
    mockRegistrables = null
    await expect(renderPagina()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('opens for whoever may register people somewhere (the volunteer coordinator)', async () => {
    hasDreamTeamMiEquipoAccess.mockReturnValue(false)
    mockRegistrables = [{ equipo_id: 'musica' }]
    await renderPagina()
    expect(screen.getByTestId('accesos')).toHaveAttribute('data-seccion', 'dream-team')
  })
})
