/**
 * @jest-environment node
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15) — Mi Recorrido shows
 * one «Tu taller cambió de fecha» card per pending answer, above the tabs,
 * and nothing extra when there is none.
 */

import MiRecorridoPage from '@/app/(auth)/talleres/mi-recorrido/page'
import { MiRecorridoTabs } from '@/app/(auth)/talleres/mi-recorrido/MiRecorridoTabs.client'
import { CambioFechaTarjeta } from '@/components/talleres/minimo/cambio-fecha-tarjeta'
import type { CambioDeFecha } from '@/lib/platform/talleres/minimo-suspension'

jest.mock('@/lib/platform/talleres/participante', () => ({
  requireParticipante: jest.fn(),
  loadParticipanteActiveTalleres: jest.fn(),
  loadParticipanteHistorial: jest.fn(),
  loadParticipanteCertificados: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/minimo-suspension', () => ({ loadMisCambiosDeFecha: jest.fn() }))
jest.mock('@/components/talleres/minimo/cambio-fecha-tarjeta', () => ({ CambioFechaTarjeta: () => null }))

const participante = jest.requireMock('@/lib/platform/talleres/participante')
const loadCambiosMock = jest.requireMock('@/lib/platform/talleres/minimo-suspension').loadMisCambiosDeFecha as jest.Mock

const CAMBIO: CambioDeFecha = {
  inscripcionId: 'i-1',
  tallerNombre: 'Parejas',
  edicionNombre: null,
  fechaInicio: '2027-02-06',
  fechaAnterior: '2027-01-16',
  lugar: null,
  mensaje: null,
  limite: '2027-02-02',
}

function findAllByType(node: unknown, type: unknown, out: Array<{ props: Record<string, unknown> }> = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, out)
    return out
  }
  if (typeof node === 'object' && 'type' in (node as object)) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) out.push(el as { props: Record<string, unknown> })
    findAllByType(el.props?.children, type, out)
  }
  return out
}

const SUPABASE = { rpc: jest.fn() }

beforeEach(() => {
  participante.requireParticipante.mockReset().mockResolvedValue({ supabase: SUPABASE, personaId: 'p-1', capabilities: [] })
  participante.loadParticipanteActiveTalleres.mockReset().mockResolvedValue([])
  participante.loadParticipanteHistorial.mockReset().mockResolvedValue([])
  participante.loadParticipanteCertificados.mockReset().mockResolvedValue([])
  loadCambiosMock.mockReset()
})

describe('MiRecorridoPage — cambios de fecha (T8a)', () => {
  it('loads the pending answers with the participant client and renders one card each', async () => {
    loadCambiosMock.mockResolvedValue([CAMBIO, { ...CAMBIO, inscripcionId: 'i-2' }])
    const element = await MiRecorridoPage()
    expect(loadCambiosMock).toHaveBeenCalledWith(SUPABASE)
    const tarjetas = findAllByType(element, CambioFechaTarjeta)
    expect(tarjetas.map((t) => (t.props.cambio as CambioDeFecha).inscripcionId)).toEqual(['i-1', 'i-2'])
    expect(findAllByType(element, MiRecorridoTabs)).toHaveLength(1)
  })

  it('renders no card when there is nothing to answer', async () => {
    loadCambiosMock.mockResolvedValue([])
    const element = await MiRecorridoPage()
    expect(findAllByType(element, CambioFechaTarjeta)).toHaveLength(0)
    expect(findAllByType(element, MiRecorridoTabs)).toHaveLength(1)
  })
})
