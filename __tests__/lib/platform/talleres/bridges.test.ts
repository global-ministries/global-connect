/**
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — id-resolving bridges
 * for the old dynamic-id routes with no straight-through static redirect
 * (rutas.ts's REQUIERE_PUENTE entries: /admin/talleres/edicion/[id] and
 * /talleres/equipo/mis-grupos/[id] + its asistencia/reporte subroutes).
 *
 * Both resolvers compose EXISTING loaders (loadEdicionLocalDetalle,
 * loadGrupoDetalle) — no new query, no new RLS surface — and return
 * `null` on any failure so the calling bridge page always has a safe
 * fallback instead of ever 404ing.
 */

const loadEdicionLocalDetalleMock = jest.fn()
const loadGrupoDetalleMock = jest.fn()

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadEdicionLocalDetalle: (client: unknown, id: string) => loadEdicionLocalDetalleMock(client, id),
}))
jest.mock('@/lib/platform/talleres/grupo-detalle', () => ({
  loadGrupoDetalle: (client: unknown, id: string) => loadGrupoDetalleMock(client, id),
}))

import { resolveEdicionBridge, resolveGrupoBridge } from '@/lib/platform/talleres/bridges'

const client = {} as never

describe('resolveEdicionBridge — /admin/talleres/edicion/[id] puente', () => {
  beforeEach(() => {
    loadEdicionLocalDetalleMock.mockReset()
  })

  it('resolves to /talleres/[taller]/[edicion] when the edición exists', async () => {
    loadEdicionLocalDetalleMock.mockResolvedValue({
      id: 'ed-1',
      taller_slug: 'matrimonio-sobre-la-roca',
    })
    const destino = await resolveEdicionBridge(client, 'ed-1')
    expect(destino).toBe('/talleres/matrimonio-sobre-la-roca/ed-1')
    expect(loadEdicionLocalDetalleMock).toHaveBeenCalledWith(client, 'ed-1')
  })

  it('resolves to null when the edición is not found (or RLS denies it)', async () => {
    loadEdicionLocalDetalleMock.mockResolvedValue(null)
    const destino = await resolveEdicionBridge(client, 'missing')
    expect(destino).toBeNull()
  })
})

describe('resolveGrupoBridge — /talleres/equipo/mis-grupos/[id] puente', () => {
  beforeEach(() => {
    loadGrupoDetalleMock.mockReset()
    loadEdicionLocalDetalleMock.mockReset()
  })

  it('resolves to /talleres/[taller]/[edicion]/[grupo] when both lookups succeed', async () => {
    loadGrupoDetalleMock.mockResolvedValue({
      id: 'grupo-1',
      edicionId: 'ed-1',
      cohorteId: 'cohorte-1',
    })
    loadEdicionLocalDetalleMock.mockResolvedValue({
      id: 'ed-1',
      taller_slug: 'matrimonio-sobre-la-roca',
    })
    const destino = await resolveGrupoBridge(client, 'grupo-1')
    expect(destino).toBe('/talleres/matrimonio-sobre-la-roca/ed-1/grupo-1')
    expect(loadGrupoDetalleMock).toHaveBeenCalledWith(client, 'grupo-1')
    expect(loadEdicionLocalDetalleMock).toHaveBeenCalledWith(client, 'ed-1')
  })

  it('resolves to null when the grupo is not found', async () => {
    loadGrupoDetalleMock.mockResolvedValue(null)
    const destino = await resolveGrupoBridge(client, 'missing')
    expect(destino).toBeNull()
    expect(loadEdicionLocalDetalleMock).not.toHaveBeenCalled()
  })

  it('resolves to null when the grupo resolves but its edición does not', async () => {
    loadGrupoDetalleMock.mockResolvedValue({ id: 'grupo-1', edicionId: 'ed-1', cohorteId: 'cohorte-1' })
    loadEdicionLocalDetalleMock.mockResolvedValue(null)
    const destino = await resolveGrupoBridge(client, 'grupo-1')
    expect(destino).toBeNull()
  })
})
