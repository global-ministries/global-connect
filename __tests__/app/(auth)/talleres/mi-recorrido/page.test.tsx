/**
 * @jest-environment node
 *
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/mi-recorrido
 * (RSC half). Mirrors the structural-inspection pattern of
 * __tests__/app/(auth)/talleres/temporadas/page.test.tsx: call the async
 * page function directly, inspect the returned element tree via
 * extractText/findByType, no rendering.
 *
 * This is a presentation merge — the three ORIGINAL loaders
 * (loadParticipanteActiveTalleres / loadParticipanteHistorial /
 * loadParticipanteCertificados) must all still be called, unchanged, and
 * their rows must reach MiRecorridoTabs untouched. Interactive tab
 * behavior (URL-sync, restore-on-reload, per-tab content) is covered
 * separately in MiRecorridoTabs.test.tsx, a real @testing-library/react
 * render of the client half.
 */

import MiRecorridoPage from '@/app/(auth)/talleres/mi-recorrido/page'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { MiRecorridoTabs } from '@/app/(auth)/talleres/mi-recorrido/MiRecorridoTabs.client'
import type {
  ParticipanteTallerSummary,
  ParticipanteHistorialRow,
  ParticipanteCertificado,
} from '@/lib/platform/talleres/participante'

jest.mock('@/lib/platform/talleres/participante', () => ({
  requireParticipante: jest.fn(),
  loadParticipanteActiveTalleres: jest.fn(),
  loadParticipanteHistorial: jest.fn(),
  loadParticipanteCertificados: jest.fn(),
}))

const requireParticipanteMock = jest.requireMock('@/lib/platform/talleres/participante')
  .requireParticipante as jest.Mock
const loadTalleresMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteActiveTalleres as jest.Mock
const loadHistorialMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteHistorial as jest.Mock
const loadCertificadosMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteCertificados as jest.Mock

function tallerRow(overrides: Partial<ParticipanteTallerSummary> = {}): ParticipanteTallerSummary {
  return {
    id: 't-1',
    nombre: 'Matrimonio sobre la Roca',
    tipo: 'individual',
    edicion: 'Septiembre 2026',
    estado_inscripcion: 'aprobado',
    unit_estado: null,
    fecha_completitud: null,
    estado_taller: 'en_curso',
    ...overrides,
  }
}

function historialRow(overrides: Partial<ParticipanteHistorialRow> = {}): ParticipanteHistorialRow {
  return {
    id: 'h-1',
    nombre: 'Finanzas con Propósito',
    edicion: 'Marzo 2025',
    estado_inscripcion: 'completado',
    unit_estado: 'completado',
    fecha_completitud: '2025-05-01T00:00:00.000Z',
    fecha_inscripcion: '2025-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function certificadoRow(overrides: Partial<ParticipanteCertificado> = {}): ParticipanteCertificado {
  return {
    id: 'c-1',
    codigo_verificacion: 'ABC123',
    taller_id: 't-1',
    nombre_taller_snapshot: 'Finanzas con Propósito',
    fecha_completitud: '2025-05-01T00:00:00.000Z',
    revocado_at: null,
    ...overrides,
  }
}

interface SetupOpts {
  talleres?: readonly ParticipanteTallerSummary[]
  historial?: readonly ParticipanteHistorialRow[]
  certificados?: readonly ParticipanteCertificado[]
}

function setup(opts: SetupOpts = {}): void {
  requireParticipanteMock.mockReset().mockResolvedValue({
    supabase: {},
    personaId: 'p-1',
    capabilities: [],
  })
  loadTalleresMock.mockReset().mockResolvedValue(opts.talleres ?? [])
  loadHistorialMock.mockReset().mockResolvedValue(opts.historial ?? [])
  loadCertificadosMock.mockReset().mockResolvedValue(opts.certificados ?? [])
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

describe('MiRecorridoPage — gate', () => {
  it('calls requireParticipante() (odd/tasks/talleres-autoinscripcion.md criterion 7 — no capability gate)', async () => {
    setup()
    await MiRecorridoPage()
    expect(requireParticipanteMock).toHaveBeenCalledTimes(1)
  })
})

describe('MiRecorridoPage — loaders (presentation merge, not a data merge)', () => {
  it('calls all three ORIGINAL loaders, unchanged', async () => {
    setup()
    await MiRecorridoPage()
    expect(loadTalleresMock).toHaveBeenCalledTimes(1)
    expect(loadHistorialMock).toHaveBeenCalledTimes(1)
    expect(loadCertificadosMock).toHaveBeenCalledTimes(1)
  })

  it("passes each loader's rows through to MiRecorridoTabs untouched", async () => {
    const talleres = [tallerRow()]
    const historial = [historialRow()]
    const certificados = [certificadoRow()]
    setup({ talleres, historial, certificados })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await MiRecorridoPage()) as any
    const tabs = findByType(element, MiRecorridoTabs)
    expect(tabs).not.toBeNull()
    expect(tabs?.props.talleres).toBe(talleres)
    expect(tabs?.props.historial).toBe(historial)
    expect(tabs?.props.certificados).toBe(certificados)
  })
})

describe('MiRecorridoPage — page shell', () => {
  it('titles the page "Mi Recorrido" and returns Home', async () => {
    setup()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await MiRecorridoPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Mi Recorrido')
    expect(dashboard?.props.botonRegreso).toEqual({ href: '/dashboard', texto: 'Inicio' })
  })
})
