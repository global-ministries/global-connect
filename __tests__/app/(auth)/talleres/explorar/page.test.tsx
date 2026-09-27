/**
 * @jest-environment node
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — /talleres/
 * explorar must never show a stale STORED estado on its edición badges:
 * refrescarEstadosEdiciones(client) (unscoped — explorar spans every open
 * taller) runs before loadParticipanteExplorar reads, same convention the
 * catálogo/taller/edición pages already use.
 */

import ExplorarTalleresPage from '@/app/(auth)/talleres/explorar/page'
import { ExplorarTalleresClient } from '@/app/(auth)/talleres/explorar/explorar-client'

jest.mock('@/lib/platform/talleres/participante', () => ({
  requireExplorarViewer: jest.fn(),
  loadParticipanteExplorar: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({
  refrescarEstadosEdiciones: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/app/(auth)/talleres/explorar/explorar-client', () => ({
  ExplorarTalleresClient: () => null,
}))

const requireExplorarViewerMock = jest.requireMock('@/lib/platform/talleres/participante')
  .requireExplorarViewer as jest.Mock
const loadParticipanteExplorarMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteExplorar as jest.Mock
const refrescarEstadosEdicionesMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados')
  .refrescarEstadosEdiciones as jest.Mock

function buildSupabaseMock() {
  return {
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    })),
  }
}

/** Finds the first element of the given type in the tree, WITHOUT executing it. */
function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) return el as { props: Record<string, unknown> }
    return findByType(el.props?.children, type)
  }
  return null
}

beforeEach(() => {
  const supabase = buildSupabaseMock()
  requireExplorarViewerMock.mockReset().mockResolvedValue({ supabase, personaId: 'p-1', capabilities: [] })
  loadParticipanteExplorarMock.mockReset().mockResolvedValue([])
  refrescarEstadosEdicionesMock.mockReset().mockResolvedValue(undefined)
})

describe('ExplorarTalleresPage — estado derivado (T5)', () => {
  it('calls refrescarEstadosEdiciones with the viewer supabase client before loadParticipanteExplorar', async () => {
    await ExplorarTalleresPage()
    expect(refrescarEstadosEdicionesMock).toHaveBeenCalledTimes(1)
    expect(loadParticipanteExplorarMock).toHaveBeenCalledTimes(1)
    const refreshOrder = refrescarEstadosEdicionesMock.mock.invocationCallOrder[0]!
    const loadOrder = loadParticipanteExplorarMock.mock.invocationCallOrder[0]!
    expect(refreshOrder).toBeLessThan(loadOrder)
  })

  it('still renders the talleres list through ExplorarTalleresClient', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ExplorarTalleresPage()) as any
    expect(findByType(element, ExplorarTalleresClient)).not.toBeNull()
  })
})
