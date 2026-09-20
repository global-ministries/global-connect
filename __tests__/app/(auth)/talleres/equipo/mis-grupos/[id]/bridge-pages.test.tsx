/**
 * @jest-environment node
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — the 3 REQUIERE_PUENTE
 * bridge pages under /talleres/equipo/mis-grupos/[id]/**: the old grupo
 * detail, asistencia and reporte screens are gone; each id now resolves
 * to the new /talleres/[taller]/[edicion]/[grupo] home and redirects
 * there. odd/tasks/talleres-consolidar-pantallas.md's own control: both
 * subroutes are read-only and asistencia only ever rendered after a
 * hand-typed `?sesion_id=`, so redirecting straight to the new grupo
 * screen (which already shows attendance per clase) loses nothing.
 *
 * All three pages share the exact same resolve-then-redirect shape, so
 * one parameterized suite covers all three page.tsx files.
 */

// No static import in this file besides this one — everything else is a
// dynamic `await import(...)` so each `describe.each` case re-imports its
// own page module fresh. This `export {}` forces module scope (otherwise
// TS treats a file with zero top-level import/export as a global script,
// and its top-level `const`s collide with the sibling edicion bridge
// test's identically-named mocks).
export {}

const resolveGrupoBridgeMock = jest.fn()
const isTalleresEnabledMock = jest.fn()
const redirectMock = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})

jest.mock('next/navigation', () => ({ redirect: (path: string) => redirectMock(path) }))
jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: () => isTalleresEnabledMock(),
}))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({ marker: 'server-client' }),
}))
jest.mock('@/lib/platform/talleres/bridges', () => ({
  resolveGrupoBridge: (client: unknown, id: string) => resolveGrupoBridgeMock(client, id),
}))

const PAGES = [
  ['/talleres/equipo/mis-grupos/[id]', '@/app/(auth)/talleres/equipo/mis-grupos/[id]/page'],
  [
    '/talleres/equipo/mis-grupos/[id]/asistencia',
    '@/app/(auth)/talleres/equipo/mis-grupos/[id]/asistencia/page',
  ],
  [
    '/talleres/equipo/mis-grupos/[id]/reporte',
    '@/app/(auth)/talleres/equipo/mis-grupos/[id]/reporte/page',
  ],
] as const

describe.each(PAGES)('%s bridge', (_label, modulePath) => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to the resolved /talleres/[taller]/[edicion]/[grupo] path when the grupo resolves', async () => {
    isTalleresEnabledMock.mockReturnValue(true)
    resolveGrupoBridgeMock.mockResolvedValue('/talleres/proximo-paso/ed-1/grupo-1')

    const { default: Page } = await import(modulePath)
    await expect(Page({ params: Promise.resolve({ id: 'grupo-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/talleres/proximo-paso/ed-1/grupo-1',
    )
    expect(resolveGrupoBridgeMock).toHaveBeenCalledWith({ marker: 'server-client' }, 'grupo-1')
  })

  it('falls back to /talleres (never a 404) when the grupo does not resolve', async () => {
    isTalleresEnabledMock.mockReturnValue(true)
    resolveGrupoBridgeMock.mockResolvedValue(null)

    const { default: Page } = await import(modulePath)
    await expect(Page({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/talleres',
    )
  })

  it('falls back to /talleres without looking up the grupo when the flag is off', async () => {
    isTalleresEnabledMock.mockReturnValue(false)

    const { default: Page } = await import(modulePath)
    await expect(Page({ params: Promise.resolve({ id: 'grupo-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/talleres',
    )
    expect(resolveGrupoBridgeMock).not.toHaveBeenCalled()
  })
})
