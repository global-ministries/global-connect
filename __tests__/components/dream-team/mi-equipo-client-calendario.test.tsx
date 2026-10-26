/**
 * `<MiEquipoClient>` — the "Calendario" of dated shifts (A2 of
 * odd/tasks/tlr-calendario-servicios.md): asked for the selected card only
 * when the campus has a dated shift, never otherwise; a dated shift reads
 * "Por fechas" in each person's shift line.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { listarDirecciones, vistaDeDireccion } from '@/lib/platform/dream-team/mi-equipo-vista'
import { ID_CONEXION, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => <h1>{titulo}</h1>,
}))

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ turnos: [] }) } as Response)
  global.fetch = fetchMock as unknown as typeof fetch
})

function props(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, personasPorEquipoConexion),
    vista: vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION),
    direccionId: ID_CONEXION,
    puedeEditar: false,
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  }
}

it('asks for the calendar of the selected card when the campus has a dated shift', async () => {
  render(<MiEquipoClient {...props({ hayTurnosPorFechas: true })} />)
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/dream-team/turnos/calendario?equipoId=${encodeURIComponent(ID_CONEXION)}`,
      expect.objectContaining({ cache: 'no-store' }),
    ),
  )
})

it('asks nothing without dated shifts', () => {
  render(<MiEquipoClient {...props()} />)
  expect(screen.getByRole('heading', { name: 'Mi equipo' })).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
