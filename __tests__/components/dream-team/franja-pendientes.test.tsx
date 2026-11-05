/**
 * The "Pendientes" strip (odd/tasks/dream-team-pendientes-director.md, T4, S6;
 * the strip of artboards design/pendientes-director/03 and 04): the "% en
 * orden" and the urgentes at the top of Mi equipo, on every tab, linking to
 * /dream-team/pendientes. Nothing when the summary could not be read.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FranjaPendientes } from '@/components/dream-team/pendientes/franja-pendientes'
import { MiEquipoClient, type MiEquipoClientProps } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import type { ResumenPendientes } from '@/lib/platform/dream-team/pendientes'
import { listarDirecciones, vistaDeDireccion } from '@/lib/platform/dream-team/mi-equipo-vista'
import { ID_CONEXION, arbolConexion, personasPorEquipoConexion } from '@/tests/helpers/mi-equipo-conexion'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => <header /> }))

const RESUMEN: ResumenPendientes = {
  areasSinServidores: 2,
  areasTotal: 33,
  sinCedula: 14,
  fechaNacimiento: 9,
  sinTelefono: 21,
  generoEstadoCivil: 17,
  fichasIncompletas: 38,
  sinCuenta: 37,
  invitacionesVencidas: 6,
  porActivar: 13,
  sinTurno: 58,
  solicitudes: 1,
  urgentes: 9,
  personasTotal: 214,
  personasEnOrden: 118,
  porcentaje: 55,
}

describe('FranjaPendientes', () => {
  it('shows the % en orden, each urgent count and links to Pendientes', () => {
    render(<FranjaPendientes resumen={RESUMEN} />)
    const franja = screen.getByRole('region', { name: 'Estado de tu equipo' })
    expect(within(franja).getByRole('img', { name: '55% en orden' })).toBeInTheDocument()
    expect(within(franja).getByText('2 puestos sin servidores')).toBeInTheDocument()
    expect(within(franja).getByText('1 solicitud de cambio de área')).toBeInTheDocument()
    expect(within(franja).getByText('6 invitaciones vencidas')).toBeInTheDocument()
    expect(within(franja).getByText('96')).toBeInTheDocument()
    expect(within(franja).getByRole('link', { name: 'Ver pendientes, 9 urgentes' })).toHaveAttribute('href', '/dream-team/pendientes')
  })

  it('leaves out the urgent counts at 0 and says there is nothing urgent', () => {
    render(
      <FranjaPendientes resumen={{ ...RESUMEN, areasSinServidores: 0, solicitudes: 0, invitacionesVencidas: 0, urgentes: 0 }} />,
    )
    expect(screen.getByText('Nada urgente')).toBeInTheDocument()
    expect(screen.queryByText(/puestos sin servidores/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver pendientes' })).toHaveAttribute('href', '/dream-team/pendientes')
  })

  it('renders nothing without a summary or without people', () => {
    const { container, rerender } = render(<FranjaPendientes resumen={null} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<FranjaPendientes resumen={{ ...RESUMEN, porcentaje: null, personasTotal: 0 }} />)
    expect(screen.queryByRole('img', { name: /en orden/ })).not.toBeInTheDocument()
  })
})

describe('Mi equipo — the strip on every tab', () => {
  const TLR = '00000000-0000-4000-8000-000000000010'
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          turnos: [
            {
              id: TLR,
              nombre: 'The Living Room',
              hora: '10:00',
              puedeGestionar: true,
              fechas: [{ id: 'f1', turnoId: TLR, fecha: '2999-11-08', hora: null, nota: null, servidores: [] }],
            },
          ],
        }),
    } as Response)
    global.fetch = fetchMock as unknown as typeof fetch
  })

  const props = (overrides: Partial<MiEquipoClientProps> = {}): MiEquipoClientProps => ({
    direcciones: listarDirecciones(arbolConexion, personasPorEquipoConexion),
    vista: vistaDeDireccion(arbolConexion, personasPorEquipoConexion, ID_CONEXION),
    direccionId: ID_CONEXION,
    rol: 'director',
    equiposAsignables: [],
    rolesPorEquipo: {},
    ...overrides,
  })

  it('stays above the Personas and the Calendario tabs', async () => {
    const user = userEvent.setup({ delay: null })
    render(<MiEquipoClient {...props({ hayTurnosPorFechas: true, resumenPendientes: RESUMEN })} />)
    const tabs = await screen.findByRole('tablist', { name: 'Secciones de Mi equipo' })
    expect(screen.getByRole('region', { name: 'Estado de tu equipo' })).toBeInTheDocument()
    await user.click(within(tabs).getByRole('tab', { name: /^Calendario/ }))
    expect(screen.getByRole('region', { name: 'Estado de tu equipo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver pendientes, 9 urgentes' })).toHaveAttribute('href', '/dream-team/pendientes')
  })

  it('is absent when the summary was not read (previous Mi equipo)', () => {
    render(<MiEquipoClient {...props()} />)
    expect(screen.queryByRole('region', { name: 'Estado de tu equipo' })).not.toBeInTheDocument()
  })
})
