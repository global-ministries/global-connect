/**
 * @jest-environment node
 *
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) —
 * /talleres/mi-recorrido/certificados/[id]. A straight move of
 * app/(auth)/talleres/certificados/[id]/ (kept alive, unmodified, until
 * T10) — same loader (loadParticipanteCertificado, deny-by-default on
 * persona_id, unchanged), same gate (requireParticipante()), only the URL
 * and the back-link moved. Mirrors the structural-inspection pattern of
 * __tests__/app/(auth)/talleres/temporadas/page.test.tsx.
 */

import CertificadoDetailPage from '@/app/(auth)/talleres/mi-recorrido/certificados/[id]/page'
import { ContenedorDashboard, BadgeSistema } from '@/components/ui/sistema-diseno'
import type { ParticipanteCertificado } from '@/lib/platform/talleres/participante'

jest.mock('@/lib/platform/talleres/participante', () => ({
  requireParticipante: jest.fn(),
  loadParticipanteCertificado: jest.fn(),
}))

const requireParticipanteMock = jest.requireMock('@/lib/platform/talleres/participante')
  .requireParticipante as jest.Mock
const loadCertificadoMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteCertificado as jest.Mock

function certificado(overrides: Partial<ParticipanteCertificado> = {}): ParticipanteCertificado {
  return {
    id: 'c-1',
    codigo_verificacion: 'ABC123XYZ',
    taller_id: 't-1',
    nombre_taller_snapshot: 'Finanzas con Propósito',
    fecha_completitud: '2025-05-01T00:00:00.000Z',
    revocado_at: null,
    ...overrides,
  }
}

function setup(cert: ParticipanteCertificado | null): void {
  requireParticipanteMock.mockReset().mockResolvedValue({ supabase: {}, personaId: 'p-1', capabilities: [] })
  loadCertificadoMock.mockReset().mockResolvedValue(cert)
}

/** Finds EVERY element of the given type in the tree, WITHOUT executing it. */
function findAllByType(
  node: unknown,
  type: unknown,
  acc: Array<{ props: Record<string, unknown> }> = [],
): Array<{ props: Record<string, unknown> }> {
  if (node === null || node === undefined || typeof node === 'boolean') return acc
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, acc)
    return acc
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) acc.push(el as { props: Record<string, unknown> })
    findAllByType(el.props?.children, type, acc)
    return acc
  }
  return acc
}

function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  return findAllByType(node, type)[0] ?? null
}

function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return extractText(props?.children)
  }
  return ''
}

describe('CertificadoDetailPage — gate + deny-by-default', () => {
  it('calls requireParticipante() and loadParticipanteCertificado(ctx, id)', async () => {
    setup(certificado())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    await CertificadoDetailPage({ params: Promise.resolve({ id: 'c-1' }) } as any)
    expect(requireParticipanteMock).toHaveBeenCalledTimes(1)
    expect(loadCertificadoMock).toHaveBeenCalledWith(expect.anything(), 'c-1')
  })

  it('shows a not-found message, never a crash, when the certificado is null (not owned or does not exist)', async () => {
    setup(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CertificadoDetailPage({ params: Promise.resolve({ id: 'c-1' }) } as any)) as any
    expect(extractText(element)).toMatch(/no existe o no te pertenece/i)
  })
})

describe('CertificadoDetailPage — back link returns to the certificados tab', () => {
  it('botonRegreso points at /talleres/mi-recorrido?tab=certificados', async () => {
    setup(certificado())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CertificadoDetailPage({ params: Promise.resolve({ id: 'c-1' }) } as any)) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.botonRegreso).toEqual({
      href: '/talleres/mi-recorrido?tab=certificados',
      texto: 'Mis Certificados',
    })
  })
})

describe('CertificadoDetailPage — content', () => {
  it('renders the taller name and revocado/vigente state', async () => {
    setup(certificado({ nombre_taller_snapshot: 'Matrimonio sobre la Roca', revocado_at: null }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CertificadoDetailPage({ params: Promise.resolve({ id: 'c-1' }) } as any)) as any
    expect(extractText(element)).toMatch(/matrimonio sobre la roca/i)
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /vigente/i.test(extractText(b.props.children)))).toBe(true)
  })

  it('shows Revocado when revocado_at is set', async () => {
    setup(certificado({ revocado_at: '2025-06-01T00:00:00.000Z' }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CertificadoDetailPage({ params: Promise.resolve({ id: 'c-1' }) } as any)) as any
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /revocado/i.test(extractText(b.props.children)))).toBe(true)
  })
})
