/**
 * Age metrics (D10) in Servidores and Mi equipo: the shared age pills count
 * the people of the selected sub-area and filter the list; without any known
 * age range (lookup failed or answered nobody) the screens look as before.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { ServidoresClient } from '@/components/dream-team/servidores/servidores-client'
import { listarDirecciones, vistaDeDireccion, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import { FILTROS_INICIALES, type FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import { ID_CONEXION, ID_PAREJAS, ID_PDP, arbolConexion, persona } from '@/tests/helpers/mi-equipo-conexion'
import { ID_CORO, ID_DHAH, arbolServidores, fila } from '@/tests/helpers/servidores-conexion'

const replace = jest.fn()

jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({ campusId: null }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => (
    <header>
      <h1>{titulo}</h1>
    </header>
  ),
}))

beforeEach(() => replace.mockClear())

const pastilla = (etiqueta: RegExp) =>
  within(screen.getByRole('group', { name: 'Filtrar por edad' })).getByRole('button', { name: etiqueta })

describe('Mi equipo — age metrics', () => {
  const personas: PersonasPorEquipo = {
    [ID_PAREJAS]: [
      { ...persona('a', 'Ana Uno', 'Facilitador'), rangoEdad: '12_17' },
      { ...persona('b', 'Beto Dos', 'Facilitador'), rangoEdad: '26_mas' },
    ],
    [ID_PDP]: [{ ...persona('c', 'Carla Tres', 'Facilitador'), rangoEdad: '12_17' }],
  }

  function renderizar(porEquipo: PersonasPorEquipo) {
    render(
      <MiEquipoClient
        direcciones={listarDirecciones(arbolConexion, porEquipo)}
        vista={vistaDeDireccion(arbolConexion, porEquipo, ID_CONEXION)}
        direccionId={ID_CONEXION}
        puedeEditar={false}
        equiposAsignables={[]}
        rolesPorEquipo={{}}
      />,
    )
  }

  const nombres = () =>
    within(screen.getByRole('list', { name: 'Personas del equipo' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')

  it('counts the whole dirección, then the selected sub-area, and filters the list', async () => {
    renderizar(personas)
    expect(pastilla(/^12–17/)).toHaveTextContent('12–172')
    expect(pastilla(/^26\+/)).toHaveTextContent('26+1')

    await userEvent.click(screen.getByRole('button', { name: (nombre) => nombre.startsWith('Parejas') }))
    expect(pastilla(/^12–17/)).toHaveTextContent('12–171')

    await userEvent.click(pastilla(/^12–17/))
    expect(pastilla(/^12–17/)).toHaveAttribute('aria-pressed', 'true')
    expect(nombres()).toHaveLength(1)
    expect(nombres()[0]).toContain('Ana Uno')
  })

  it('shows no age pills when nobody has a known range', () => {
    renderizar({ [ID_PAREJAS]: [persona('a', 'Ana Uno', 'Facilitador')] })
    expect(screen.queryByRole('group', { name: 'Filtrar por edad' })).not.toBeInTheDocument()
  })
})

describe('Servidores — age metrics', () => {
  const filas: FilaServidor[] = [
    fila('a', 'Ana', ID_DHAH, 'Voluntario', { rangoEdad: '12_17' }),
    fila('b', 'Beto', ID_CORO, 'Voluntario', { rangoEdad: '26_mas' }),
  ]

  function renderizar(lista: readonly FilaServidor[]) {
    render(
      <ServidoresClient
        filas={lista}
        arbol={arbolServidores}
        rolesPorEquipo={{}}
        puedeEditar={false}
        filtrosIniciales={{ ...FILTROS_INICIALES, agrupar: 'ninguno' }}
      />,
    )
  }

  it('counts per range and filters the list, mirrored into the URL', async () => {
    renderizar(filas)
    expect(pastilla(/^12–17/)).toHaveTextContent('12–171')
    expect(pastilla(/^18–25/)).toHaveTextContent('18–250')

    await userEvent.click(pastilla(/^26\+/))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?edad=26_mas&agrupar=ninguno', { scroll: false })
    const tabla = screen.getByRole('table', { name: 'Servicios' })
    expect(within(tabla).getByRole('button', { name: 'Abrir Beto en Coro' })).toBeInTheDocument()
    expect(within(tabla).queryByText('Ana')).not.toBeInTheDocument()
  })

  it('shows no age pills when nobody has a known range', () => {
    renderizar([fila('x', 'Xavi', ID_CORO, 'Voluntario')])
    expect(screen.queryByRole('group', { name: 'Filtrar por edad' })).not.toBeInTheDocument()
  })
})
