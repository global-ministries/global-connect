/**
 * `<MiEquipoClient>` — the "Personas | Calendario" tabs (T7a-3, S11 decisions 8
 * and 9 of odd/tasks/sistema-diseno-v2.md; A2 of
 * odd/tasks/tlr-calendario-servicios.md). The calendar of the current scope is
 * asked for only when the campus has a dated shift, never otherwise; the tab
 * shows only when the scope serves one, with the count of upcoming dates; the
 * tab lives in the URL and "Agregar persona" stays on it.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { FILTROS_MI_EQUIPO } from '@/lib/platform/dream-team/mi-equipo-filtros'
import { listarDirecciones, vistaDeDireccion } from '@/lib/platform/dream-team/mi-equipo-vista'
import { ID_CONEXION, ID_PAREJAS, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

const replace = jest.fn()
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal }: { accionPrincipal?: React.ReactNode }) => <header>{accionPrincipal}</header>,
}))

const TLR = '00000000-0000-4000-8000-000000000010'
const fetchMock = jest.fn()
const respuesta = (cuerpo: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) }) as Response
const conFechas = {
  turnos: [
    {
      id: TLR,
      nombre: 'The Living Room',
      hora: '10:00',
      puedeGestionar: true,
      fechas: [
        { id: 'f1', turnoId: TLR, fecha: '2999-11-08', hora: null, nota: null, servidores: [] },
        { id: 'f2', turnoId: TLR, fecha: '2999-11-22', hora: null, nota: null, servidores: [] },
      ],
    },
  ],
}

let user: ReturnType<typeof userEvent.setup>
beforeEach(() => {
  replace.mockClear()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(respuesta({ turnos: [] }))
  global.fetch = fetchMock as unknown as typeof fetch
  user = userEvent.setup({ delay: null })
})

function props(overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps {
  return {
    direcciones: listarDirecciones(arbolConexion, personasPorEquipoConexion),
    vista: vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'director',
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  }
}

const urlDe = (equipoId: string) => `/api/dream-team/turnos/calendario?equipoId=${encodeURIComponent(equipoId)}`

it('asks nothing without dated shifts, and shows no tabs', () => {
  render(<MiEquipoClient {...props()} />)
  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
})

it('asks for the calendar of the current scope; no tab when the scope serves no dated shift', async () => {
  render(<MiEquipoClient {...props({ hayTurnosPorFechas: true })} />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(urlDe(ID_CONEXION), expect.objectContaining({ cache: 'no-store' })))
  await user.click(within(screen.getByRole('group', { name: 'Equipos' })).getByRole('button', { name: /^Parejas/ }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(urlDe(ID_PAREJAS), expect.anything()))
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
})

it('"Personas | Calendario": the count of upcoming dates, the URL, and Agregar persona on both tabs', async () => {
  fetchMock.mockResolvedValue(respuesta(conFechas))
  render(<MiEquipoClient {...props({ hayTurnosPorFechas: true })} />)
  const tabs = await screen.findByRole('tablist', { name: 'Secciones de Mi equipo' })
  expect(within(tabs).getByRole('tab', { name: 'Personas' })).toHaveAttribute('aria-selected', 'true')
  const calendario = within(tabs).getByRole('tab', { name: /^Calendario/ })
  expect(calendario).toHaveTextContent('Calendario 2')

  await user.click(calendario)
  expect(calendario).toHaveAttribute('aria-selected', 'true')
  expect(replace).toHaveBeenLastCalledWith('/dream-team/mi-equipo?tab=calendario', { scroll: false })
  expect(screen.getByRole('region', { name: 'Calendario · The Living Room' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Agregar fecha' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Agregar persona' }).length).toBeGreaterThan(0)
  // The toolbar and the phone Filtros belong to Personas.
  expect(screen.queryByRole('searchbox', { name: 'Buscar en tu equipo' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Filtros/ })).not.toBeInTheDocument()
})

it('opens on the Calendario tab of a shared URL once the calendar answers', async () => {
  fetchMock.mockResolvedValue(respuesta(conFechas))
  render(<MiEquipoClient {...props({ hayTurnosPorFechas: true, filtrosIniciales: { ...FILTROS_MI_EQUIPO, tab: 'calendario' } })} />)
  expect(await screen.findByRole('tab', { name: /^Calendario/, selected: true })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Calendario · The Living Room' })).toBeInTheDocument()
})
