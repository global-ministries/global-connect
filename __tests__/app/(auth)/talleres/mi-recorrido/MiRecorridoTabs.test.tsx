/**
 * `<MiRecorridoTabs>` — the interactive half of /talleres/mi-recorrido
 * (T9, odd/tasks/talleres-consolidar-pantallas.md).
 *
 * Covers:
 *   - each tab renders its own distinct content (talleres / historial /
 *     certificados never bleed into each other)
 *   - the active tab is restored from the `?tab=` URL search param on
 *     mount (a bookmarked/shared /talleres/mi-recorrido?tab=certificados
 *     link must land on Certificados, not the default "en curso" tab)
 *   - an unknown/garbage `?tab=` value falls back to "en curso" instead
 *     of rendering nothing
 *   - switching tabs updates the URL via router.replace (linkable)
 *   - each tab has its own distinct, honest empty state
 *   - estado_inscripcion is never rendered as a raw key
 *
 * The component renders a desktop table AND mobile cards simultaneously —
 * jsdom does not apply the `hidden md:block` / `md:hidden` breakpoints, so
 * row content appears twice. Assertions on row content use getAllByText
 * accordingly (same convention as
 * __tests__/components/dream-team/servidores-client.test.tsx).
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import { MiRecorridoTabs } from '@/app/(auth)/talleres/mi-recorrido/MiRecorridoTabs.client'
import type {
  ParticipanteTallerSummary,
  ParticipanteHistorialRow,
  ParticipanteCertificado,
} from '@/lib/platform/talleres/participante'

const replaceMock = jest.fn()
let searchParamsValue = new URLSearchParams()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/talleres/mi-recorrido',
  useSearchParams: () => searchParamsValue,
}))

function tallerRow(overrides: Partial<ParticipanteTallerSummary> = {}): ParticipanteTallerSummary {
  return {
    id: 't-1',
    nombre: 'Taller Activo',
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
    nombre: 'Taller Historial',
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
    nombre_taller_snapshot: 'Taller Certificado',
    fecha_completitud: '2025-05-01T00:00:00.000Z',
    revocado_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  replaceMock.mockClear()
  searchParamsValue = new URLSearchParams()
})

describe('MiRecorridoTabs — each tab renders its own content', () => {
  it('shows only the "en curso" content by default (no tab param)', () => {
    render(
      <MiRecorridoTabs
        talleres={[tallerRow()]}
        historial={[historialRow()]}
        certificados={[certificadoRow()]}
      />,
    )
    expect(screen.getAllByText('Taller Activo').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Taller Historial').length).toBe(0)
    expect(screen.queryAllByText('Taller Certificado').length).toBe(0)
  })

  it('shows only historial content on the historial tab', () => {
    searchParamsValue = new URLSearchParams('tab=historial')
    render(
      <MiRecorridoTabs
        talleres={[tallerRow()]}
        historial={[historialRow()]}
        certificados={[certificadoRow()]}
      />,
    )
    expect(screen.getAllByText('Taller Historial').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Taller Activo').length).toBe(0)
    expect(screen.queryAllByText('Taller Certificado').length).toBe(0)
  })

  it('shows only certificados content on the certificados tab', () => {
    searchParamsValue = new URLSearchParams('tab=certificados')
    render(
      <MiRecorridoTabs
        talleres={[tallerRow()]}
        historial={[historialRow()]}
        certificados={[certificadoRow()]}
      />,
    )
    expect(screen.getAllByText('Taller Certificado').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Taller Activo').length).toBe(0)
    expect(screen.queryAllByText('Taller Historial').length).toBe(0)
  })
})

describe('MiRecorridoTabs — tab state survives reload and is linkable (?tab= search param)', () => {
  it('restores the active tab from the URL on mount', () => {
    searchParamsValue = new URLSearchParams('tab=certificados')
    render(
      <MiRecorridoTabs
        talleres={[]}
        historial={[]}
        certificados={[certificadoRow({ nombre_taller_snapshot: 'Certificado Restaurado' })]}
      />,
    )
    // Restored straight to the certificados tab — no click needed.
    expect(screen.getAllByText('Certificado Restaurado').length).toBeGreaterThan(0)
  })

  it('falls back to "en curso" for an unknown/garbage tab value instead of rendering nothing', () => {
    searchParamsValue = new URLSearchParams('tab=algo-invalido')
    render(
      <MiRecorridoTabs
        talleres={[tallerRow()]}
        historial={[]}
        certificados={[]}
      />,
    )
    expect(screen.getAllByText('Taller Activo').length).toBeGreaterThan(0)
  })

  it('clicking a tab updates the URL via router.replace so the tab is linkable', () => {
    // Radix's TabsTrigger activates on `mousedown` (see @radix-ui/react-tabs
    // Trigger), not `click` — fireEvent.click alone never fires it.
    render(
      <MiRecorridoTabs
        talleres={[]}
        historial={[historialRow()]}
        certificados={[]}
      />,
    )
    fireEvent.mouseDown(screen.getByText('Historial'), { button: 0 })
    expect(replaceMock).toHaveBeenCalledWith('/talleres/mi-recorrido?tab=historial')
  })

  it('preserves other existing search params when switching tabs', () => {
    searchParamsValue = new URLSearchParams('foo=bar')
    render(
      <MiRecorridoTabs
        talleres={[]}
        historial={[historialRow()]}
        certificados={[]}
      />,
    )
    fireEvent.mouseDown(screen.getByText('Historial'), { button: 0 })
    const calledWith = replaceMock.mock.calls[0]?.[0] as string
    expect(calledWith).toContain('foo=bar')
    expect(calledWith).toContain('tab=historial')
  })
})

describe('MiRecorridoTabs — empty states are distinct and honest per tab', () => {
  it('en curso: "No tienes talleres activos"', () => {
    render(<MiRecorridoTabs talleres={[]} historial={[historialRow()]} certificados={[certificadoRow()]} />)
    expect(screen.getByText('No tienes talleres activos')).toBeDefined()
  })

  it('historial: "Aún no tienes inscripciones registradas"', () => {
    searchParamsValue = new URLSearchParams('tab=historial')
    render(<MiRecorridoTabs talleres={[tallerRow()]} historial={[]} certificados={[certificadoRow()]} />)
    expect(screen.getByText('Aún no tienes inscripciones registradas')).toBeDefined()
  })

  it('certificados: "Aún no tienes certificados emitidos"', () => {
    searchParamsValue = new URLSearchParams('tab=certificados')
    render(<MiRecorridoTabs talleres={[tallerRow()]} historial={[historialRow()]} certificados={[]} />)
    expect(screen.getByText('Aún no tienes certificados emitidos')).toBeDefined()
  })

  it('the three empty messages are all different strings', () => {
    const messages = new Set<string>()
    const r1 = render(<MiRecorridoTabs talleres={[]} historial={[]} certificados={[]} />)
    messages.add(screen.getByText('No tienes talleres activos').textContent ?? '')
    r1.unmount()

    searchParamsValue = new URLSearchParams('tab=historial')
    const r2 = render(<MiRecorridoTabs talleres={[]} historial={[]} certificados={[]} />)
    messages.add(screen.getByText('Aún no tienes inscripciones registradas').textContent ?? '')
    r2.unmount()

    searchParamsValue = new URLSearchParams('tab=certificados')
    render(<MiRecorridoTabs talleres={[]} historial={[]} certificados={[]} />)
    messages.add(screen.getByText('Aún no tienes certificados emitidos').textContent ?? '')

    expect(messages.size).toBe(3)
  })
})

describe('MiRecorridoTabs — estados never render a raw key', () => {
  it('renders estado_inscripcion through the shared label map, not the raw key', () => {
    render(
      <MiRecorridoTabs
        talleres={[tallerRow({ estado_inscripcion: 'no_aprobado' })]}
        historial={[]}
        certificados={[]}
      />,
    )
    expect(screen.getAllByText('No aprobado').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('no_aprobado').length).toBe(0)
  })

  it('renders unit_estado through the shared label map when present', () => {
    render(
      <MiRecorridoTabs
        talleres={[tallerRow({ unit_estado: 'abandono' })]}
        historial={[]}
        certificados={[]}
      />,
    )
    expect(screen.getAllByText('Abandonó').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('abandono').length).toBe(0)
  })
})

describe('MiRecorridoTabs — em-dash for missing dates', () => {
  it('historial shows an em-dash when fecha_completitud is null', () => {
    searchParamsValue = new URLSearchParams('tab=historial')
    render(
      <MiRecorridoTabs
        talleres={[]}
        historial={[historialRow({ fecha_completitud: null })]}
        certificados={[]}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
