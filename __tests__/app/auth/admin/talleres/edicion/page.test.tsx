/**
 * @jest-environment node
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — REQUIERE_PUENTE
 * bridge, replacing /admin/talleres/edicion/[id]'s old read-only
 * projection screen. `/talleres/[taller]/[edicion]` (T4) is its
 * replacement; this page's only job now is resolving the edición id to
 * that new path and redirecting — the projection itself (cohorte,
 * inscripciones, certificados, transition actions) lives there.
 */

// Forces module scope — see the sibling grupo bridge test's identical
// comment for why (no top-level import/export otherwise, and this
// file's top-level `const`s would collide with it in a global script
// scope).
export {}

const resolveEdicionBridgeMock = jest.fn()
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
  resolveEdicionBridge: (client: unknown, id: string) => resolveEdicionBridgeMock(client, id),
}))

async function renderPage(id = 'ed-1') {
  const { default: Page } = await import('@/app/(auth)/admin/talleres/edicion/[id]/page')
  return Page({ params: Promise.resolve({ id }) })
}

describe('/admin/talleres/edicion/[id] bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to the resolved /talleres/[taller]/[edicion] path when the edición resolves', async () => {
    isTalleresEnabledMock.mockReturnValue(true)
    resolveEdicionBridgeMock.mockResolvedValue('/talleres/matrimonio-sobre-la-roca/ed-1')

    await expect(renderPage('ed-1')).rejects.toThrow(
      'NEXT_REDIRECT:/talleres/matrimonio-sobre-la-roca/ed-1',
    )
    expect(resolveEdicionBridgeMock).toHaveBeenCalledWith({ marker: 'server-client' }, 'ed-1')
  })

  it('falls back to /talleres (never a 404) when the edición does not resolve', async () => {
    isTalleresEnabledMock.mockReturnValue(true)
    resolveEdicionBridgeMock.mockResolvedValue(null)

    await expect(renderPage('missing')).rejects.toThrow('NEXT_REDIRECT:/talleres')
  })

  it('falls back to /talleres without looking up the edición when the flag is off', async () => {
    isTalleresEnabledMock.mockReturnValue(false)

    await expect(renderPage('ed-1')).rejects.toThrow('NEXT_REDIRECT:/talleres')
    expect(resolveEdicionBridgeMock).not.toHaveBeenCalled()
  })
})
