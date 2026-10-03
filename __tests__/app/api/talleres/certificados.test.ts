/**
 * @jest-environment node
 *
 * T2b (odd/tasks/talleres-cierre-de-edicion.md) — GET /api/talleres/certificados
 * (director.read). taller_certificados is keyed by (inscripcion_id,
 * persona_id): a couple inscription carries one certificate per person. The
 * route already answers a LIST per inscription; it now also returns each
 * certificate's nombre_pareja_snapshot and can narrow to one person with an
 * optional `persona_id`.
 */

import { NextRequest } from 'next/server'

import { GET } from '@/app/api/talleres/certificados/route'

jest.mock('@/lib/platform/talleres/api-helpers', () => ({
  requireTalleresApi: jest.fn(),
}))

const requireTalleresApiMock = jest.requireMock('@/lib/platform/talleres/api-helpers')
  .requireTalleresApi as jest.Mock

interface Captura {
  select: string
  eqs: Array<[string, unknown]>
}

const CERTIFICADOS_PAREJA = [
  {
    id: 'c-1',
    inscripcion_id: 'i-1',
    persona_id: 'p-principal',
    nombre_participante_snapshot: 'Ana Gómez',
    nombre_pareja_snapshot: 'Luis Pérez',
  },
  {
    id: 'c-2',
    inscripcion_id: 'i-1',
    persona_id: 'p-companero',
    nombre_participante_snapshot: 'Luis Pérez',
    nombre_pareja_snapshot: 'Ana Gómez',
  },
]

function setup(rows: unknown[]): Captura {
  const captura: Captura = { select: '', eqs: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable + chain
  const b: Record<string, any> = {
    then: (resolve: (r: { data: unknown; error: null }) => void) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  b.select = jest.fn((cols: string) => {
    captura.select = cols
    return b
  })
  b.eq = jest.fn((col: string, val: unknown) => {
    captura.eqs.push([col, val])
    return b
  })
  b.order = jest.fn(() => b)
  requireTalleresApiMock.mockReset().mockResolvedValue({ ok: true, supabase: { from: jest.fn(() => b) } })
  return captura
}

function get(query: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/talleres/certificados${query}`), { method: 'GET' })
}

describe('GET /api/talleres/certificados — one certificate per person (T2b)', () => {
  it('returns both certificates of a couple inscription, each with the partner name', async () => {
    const captura = setup(CERTIFICADOS_PAREJA)
    const res = await GET(get('?inscripcion_id=i-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.certificados.map((c: { nombre_pareja_snapshot: string }) => c.nombre_pareja_snapshot)).toEqual([
      'Luis Pérez',
      'Ana Gómez',
    ])
    expect(captura.select).toMatch(/nombre_pareja_snapshot/)
    expect(captura.eqs).toEqual([['inscripcion_id', 'i-1']])
  })

  it('narrows to one person with persona_id', async () => {
    const captura = setup([CERTIFICADOS_PAREJA[1]])
    const res = await GET(get('?inscripcion_id=i-1&persona_id=p-companero'))
    expect(res.status).toBe(200)
    expect(captura.eqs).toEqual([
      ['inscripcion_id', 'i-1'],
      ['persona_id', 'p-companero'],
    ])
  })
})
