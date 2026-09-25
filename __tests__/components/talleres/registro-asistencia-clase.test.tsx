/**
 * @jest-environment jsdom
 *
 * T3 (odd/tasks/talleres-asistencia-lider.md) — the register form the
 * líder/voluntario uses to pass list from their phone, adopting the PATTERN
 * of components/grupos/AttendanceRegister.client.tsx (Grupos de Vida is
 * untouchable — never imported here).
 *
 * The three behaviours the contract asks for, plus the two the pattern is
 * defined by:
 *   - todos presentes por defecto (and previous marks win over the default);
 *   - motivo input appears ONLY after unmarking a person;
 *   - guardar sends ONE batched POST with every marca;
 *   - atajos en lote ("Todos presentes / Todos ausentes");
 *   - empty roster never renders an empty form.
 *
 * The visibility rules ("Pasar lista" only for an assignee, only for a
 * non-cerrada clase) are page decisions, so they live in
 * __tests__/app/(auth)/talleres/[taller]/[edicion]/[grupo]/page.test.tsx —
 * this file is jsdom (it renders), that one is node (it walks the tree).
 *
 * Every prop is plain JSON: the island is reached from the server page, so
 * each value crossing the RSC boundary must serialize (lección del paso 5).
 */

import type { ComponentProps } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import {
  RegistroAsistenciaClase,
  type RegistroAsistenciaFila,
  type RegistroAsistenciaMarca,
} from '@/components/talleres/registro-asistencia-clase.client'

const refreshMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const successMock = jest.fn()
const errorMock = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: errorMock, info: jest.fn() }),
}))

const fetchMock = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test global fetch stub
;(global as any).fetch = fetchMock

const FILAS: readonly RegistroAsistenciaFila[] = [
  { id: 'i-1', nombre: 'Ana López' },
  { id: 'i-2', nombre: 'Luis Ruiz' },
  { id: 'i-3', nombre: 'Carla Soto' },
]

const PREVIAS_AUSENTE: readonly RegistroAsistenciaMarca[] = [
  { inscripcionId: 'i-2', estado: 'ausente', motivo: 'Viaje de trabajo' },
]

function renderRegistro(props: Partial<ComponentProps<typeof RegistroAsistenciaClase>> = {}) {
  return render(
    <RegistroAsistenciaClase
      sesionId="s-1"
      numero={1}
      tema="Introducción"
      filas={FILAS}
      {...props}
    />,
  )
}

function estadoDe(nombre: string): string | null | undefined {
  return screen.getByLabelText(nombre).getAttribute('aria-checked')
}

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ presentes: 3, ausentes: 0, total: 3 }),
  })
})

describe('RegistroAsistenciaClase — todos presentes por defecto', () => {
  it('marks every participant present when there are no previous marks', () => {
    renderRegistro()
    expect(estadoDe('Ana López')).toBe('true')
    expect(estadoDe('Luis Ruiz')).toBe('true')
    expect(estadoDe('Carla Soto')).toBe('true')
  })

  it('starts the counter at the full roster', () => {
    renderRegistro()
    expect(screen.getByText('Presentes: 3 / 3')).toBeInTheDocument()
  })

  it('restores a previously saved ausente (and its motivo) instead of defaulting', () => {
    renderRegistro({ marcasPrevias: PREVIAS_AUSENTE })
    expect(estadoDe('Ana López')).toBe('true')
    expect(estadoDe('Luis Ruiz')).toBe('false')
    expect(screen.getByText('Presentes: 2 / 3')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Motivo de ausencia de Luis Ruiz'),
    ).toHaveValue('Viaje de trabajo')
  })

  it('ignores a previous mark for an inscripcion that is no longer in the roster', () => {
    renderRegistro({
      marcasPrevias: [{ inscripcionId: 'i-fantasma', estado: 'ausente', motivo: 'Retirado' }],
    })
    expect(estadoDe('Ana López')).toBe('true')
    expect(estadoDe('Luis Ruiz')).toBe('true')
    expect(estadoDe('Carla Soto')).toBe('true')
  })
})

describe('RegistroAsistenciaClase — motivo sólo al desmarcar', () => {
  it('shows no motivo input while everybody is present', () => {
    renderRegistro()
    expect(screen.queryAllByLabelText(/^Motivo de ausencia/)).toHaveLength(0)
  })

  it('shows the motivo input only for the person that was unmarked', () => {
    renderRegistro()
    fireEvent.click(screen.getByLabelText('Ana López'))
    expect(screen.getByLabelText('Motivo de ausencia de Ana López')).toBeInTheDocument()
    expect(screen.queryByLabelText('Motivo de ausencia de Luis Ruiz')).toBeNull()
    expect(screen.queryByLabelText('Motivo de ausencia de Carla Soto')).toBeNull()
  })

  it('hides the motivo again when the person is re-marked', () => {
    renderRegistro({ marcasPrevias: PREVIAS_AUSENTE })
    expect(screen.getByLabelText('Motivo de ausencia de Luis Ruiz')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Luis Ruiz'))
    expect(screen.queryByLabelText('Motivo de ausencia de Luis Ruiz')).toBeNull()
    expect(screen.getByText('Presentes: 3 / 3')).toBeInTheDocument()
  })
})

describe('RegistroAsistenciaClase — guardar envía el lote', () => {
  it('sends ONE request carrying every marca of the roster', async () => {
    renderRegistro()
    fireEvent.click(screen.getByLabelText('Ana López'))
    fireEvent.change(screen.getByLabelText('Motivo de ausencia de Ana López'), {
      target: { value: 'Viaje de trabajo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar asistencia/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/talleres/sesiones/s-1/asistencia',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marcas: [
            { inscripcion_id: 'i-1', estado: 'ausente', motivo: 'Viaje de trabajo' },
            { inscripcion_id: 'i-2', estado: 'presente' },
            { inscripcion_id: 'i-3', estado: 'presente' },
          ],
        }),
      }),
    )
  })

  it('refreshes the route and toasts on success', async () => {
    renderRegistro()
    fireEvent.click(screen.getByRole('button', { name: /Guardar asistencia/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(successMock).toHaveBeenCalledTimes(1)
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('toasts the server message and does NOT refresh when the API refuses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'CLASE_CERRADA', message: 'Esta clase ya está cerrada.' }),
    })
    renderRegistro()
    fireEvent.click(screen.getByRole('button', { name: /Guardar asistencia/ }))

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1))
    expect(errorMock).toHaveBeenCalledWith('Esta clase ya está cerrada.')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
  })

  it('never sends the motivo of a person that is present', async () => {
    renderRegistro({ marcasPrevias: PREVIAS_AUSENTE })
    // Re-mark the absent person: the stale motivo must not travel.
    fireEvent.click(screen.getByLabelText('Luis Ruiz'))
    fireEvent.click(screen.getByRole('button', { name: /Guardar asistencia/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      marcas: Array<{ inscripcion_id: string; estado: string; motivo?: string }>
    }
    expect(body.marcas).toEqual([
      { inscripcion_id: 'i-1', estado: 'presente' },
      { inscripcion_id: 'i-2', estado: 'presente' },
      { inscripcion_id: 'i-3', estado: 'presente' },
    ])
  })
})

describe('RegistroAsistenciaClase — atajos en lote (patrón AttendanceRegister)', () => {
  it('"Todos ausentes" unmarks the whole roster and updates the counter', () => {
    renderRegistro()
    fireEvent.click(screen.getByRole('button', { name: /Todos ausentes/ }))
    expect(estadoDe('Ana López')).toBe('false')
    expect(estadoDe('Luis Ruiz')).toBe('false')
    expect(estadoDe('Carla Soto')).toBe('false')
    expect(screen.getByText('Presentes: 0 / 3')).toBeInTheDocument()
  })

  it('"Todos presentes" re-marks a roster that was fully unmarked', () => {
    renderRegistro()
    fireEvent.click(screen.getByRole('button', { name: /Todos ausentes/ }))
    fireEvent.click(screen.getByRole('button', { name: /Todos presentes/ }))
    expect(estadoDe('Ana López')).toBe('true')
    expect(estadoDe('Carla Soto')).toBe('true')
    expect(screen.getByText('Presentes: 3 / 3')).toBeInTheDocument()
  })
})

describe('RegistroAsistenciaClase — clases de borde', () => {
  it('never renders an empty form when the grupo has no approved participants', () => {
    renderRegistro({ filas: [] })
    expect(screen.queryByRole('button', { name: /Guardar asistencia/ })).toBeNull()
    expect(screen.getByText(/no hay participantes/i)).toBeInTheDocument()
  })

  it('titles the form "Clase {numero} · {tema}" and falls back when tema is NULL', () => {
    renderRegistro({ numero: 4, tema: null })
    expect(screen.getByRole('heading', { level: 3, name: 'Clase 4' })).toBeInTheDocument()
  })
})
