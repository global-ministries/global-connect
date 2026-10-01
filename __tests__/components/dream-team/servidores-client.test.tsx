/**
 * `<ServidoresClient>` — island for /admin/dream-team/servidores.
 *
 * Replaces the old suite (single etapa filter inside a Sheet, per-row "Cambiar
 * etapa" button, "Activo: N" badges, ?equipo= read through useSearchParams):
 * the screen now has etapa counters as filters, a visible filter bar, quick
 * filters, grouping, sortable columns, pills and a per-row "⋯" menu. Acceptance
 * criteria 1-5, 7 and 8 of odd/tasks/dream-team-servidores-rediseno.md are
 * expressed with the Conexión-shaped fixture (tests/helpers/servidores-conexion.ts:
 * 38 servicios, 36 personas, 31 without account, Jose Jimenez and Antholy
 * Ludovic with two servicios each) plus a second dirección (Alabanza).
 *
 * The table and the phone cards are both rendered (jsdom applies no
 * breakpoints), so table assertions are scoped to the "Servicios" table.
 */
import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ServidoresClient, type ServidoresClientProps } from '@/components/dream-team/servidores/servidores-client'
import { FILTROS_INICIALES, leerFiltrosDeUrl, type FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import {
  ID_CONEXION,
  ID_CORO,
  ID_DHAH,
  ID_PDP,
  arbolServidores,
  fila,
  todasLasFilas,
  filasConexion,
} from '@/tests/helpers/servidores-conexion'

const replace = jest.fn()
const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
}))

// ContenedorDashboard lazy-loads its header behind Suspense — same synchronous
// test double as __tests__/app/dashboard-page.test.tsx.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({
    children,
    titulo,
    accionPrincipal,
  }: {
    children: React.ReactNode
    titulo?: string
    accionPrincipal?: React.ReactNode
  }) => (
    <section>
      <h1>{titulo}</h1>
      {accionPrincipal}
      {children}
    </section>
  ),
}))

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
})

function props(overrides: Partial<ServidoresClientProps> = {}): ServidoresClientProps {
  return {
    filas: todasLasFilas,
    arbol: arbolServidores,
    rolesPorEquipo: {},
    puedeEditar: false,
    filtrosIniciales: FILTROS_INICIALES,
    ...overrides,
  }
}

const tabla = () => screen.getByRole('table', { name: 'Servicios' })
/** Data rows only: the header row and the group header rows (no cells) are excluded. */
const filasDeTabla = () => within(tabla()).getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
const nombresEnTabla = () => filasDeTabla().map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
const pie = () => screen.getByText(/servicios? · \d+ personas?/)

describe('ServidoresClient — etapa counters as filters (criterion 1)', () => {
  it('shows one counter per etapa, reacting to the rest of the filters', async () => {
    render(<ServidoresClient {...props()} />)
    expect(screen.getByRole('button', { name: 'Todas 40' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Activo 37' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En orientación 2' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Equipo'), ID_PDP)
    expect(screen.getByRole('button', { name: 'Activo 13' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'En pausa 0' })).toBeInTheDocument()
  })

  it('tapping Activo filters, tapping it again removes the filter', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const activo = screen.getByRole('button', { name: 'Activo 35' })

    await userEvent.click(activo)
    expect(activo).toHaveAttribute('aria-pressed', 'true')
    expect(filasDeTabla()).toHaveLength(35)
    expect(within(tabla()).queryByText('En orientación')).not.toBeInTheDocument()

    await userEvent.click(activo)
    expect(activo).toHaveAttribute('aria-pressed', 'false')
    expect(filasDeTabla()).toHaveLength(38)
  })

  it('mirrors the etapa into the URL without scrolling', async () => {
    render(<ServidoresClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /^En pausa/ }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?etapa=en_pausa', { scroll: false })
    await userEvent.click(screen.getByRole('button', { name: /^En pausa/ }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores', { scroll: false })
  })
})

describe('ServidoresClient — dirección → equipo cascade (criterion 2)', () => {
  const opcionesDe = (etiqueta: string) => Array.from((screen.getByLabelText(etiqueta) as HTMLSelectElement).options).map((o) => o.text)

  it('choosing the Dirección de Conexión narrows the equipo selector to its own teams', async () => {
    render(<ServidoresClient {...props()} />)
    expect(opcionesDe('Equipo')).toContain('Coro')

    await userEvent.selectOptions(screen.getByLabelText('Dirección'), ID_CONEXION)
    expect(opcionesDe('Equipo')).toEqual(['Todos', 'De Hombre a Hombre', 'Dirección de Conexión', 'Mujer de Hoy', 'Parejas', 'Punto de Partida'])
    expect(filasDeTabla()).toHaveLength(38)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?direccion=dir-conexion', { scroll: false })
  })

  it('choosing an equipo fixes its dirección', async () => {
    render(<ServidoresClient {...props()} />)
    await userEvent.selectOptions(screen.getByLabelText('Equipo'), ID_CORO)
    expect(screen.getByLabelText('Dirección')).toHaveValue('dir-alabanza')
    expect(nombresEnTabla().sort()).toEqual([expect.stringContaining('Sara Ponce'), expect.stringContaining('Tomás Rey')])
  })
})

describe('ServidoresClient — quick filters (criterion 3)', () => {
  it('"Sin cuenta" leaves 31 of 38 servicios in Conexión', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    expect(screen.getByRole('button', { name: 'Sin cuenta · 31' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'En varios equipos · 4' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sin cuenta · 31' }))
    expect(filasDeTabla()).toHaveLength(31)
    expect(pie()).toHaveTextContent('31 servicios · 31 personas')
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?sin_cuenta=1', { scroll: false })
  })

  it('"En varios equipos" lists only people with two or more servicios', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await userEvent.click(screen.getByRole('button', { name: 'En varios equipos · 4' }))
    expect(filasDeTabla()).toHaveLength(4)
    expect(pie()).toHaveTextContent('4 servicios · 2 personas')
  })
})

describe('ServidoresClient — grouping and sorting (criteria 4 and 5)', () => {
  it('"Por persona" shows Jose Jimenez with both servicios under one header', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Por persona' }))

    const cabecera = within(tabla()).getByRole('rowheader', { name: /Jose Jimenez/ })
    expect(cabecera).toHaveTextContent('2 servicios')
    const filas = within(tabla()).getAllByRole('row')
    const i = filas.indexOf(cabecera.closest('tr') as HTMLElement)
    expect(within(filas[i + 1]).getByText('De Hombre a Hombre')).toBeInTheDocument()
    expect(within(filas[i + 2]).getByText('Punto de Partida')).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?agrupar=persona', { scroll: false })
  })

  it('"Por equipo" adds a header per team with its size', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Por equipo' }))
    expect(within(tabla()).getByRole('rowheader', { name: /Punto de Partida/ })).toHaveTextContent('14 personas')
    expect(within(tabla()).getByRole('rowheader', { name: /Dirección de Conexión/ })).toHaveTextContent('1 persona')
  })

  it('sorting by Equipo and tapping again reverses it; aria-sort and the footer say so', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const columna = () => within(tabla()).getByRole('columnheader', { name: /Equipo/ })
    expect(within(tabla()).getByRole('columnheader', { name: /Persona/ })).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(within(tabla()).getByRole('button', { name: 'Ordenar por equipo' }))
    expect(columna()).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('Orden: equipo, ascendente')).toBeInTheDocument()
    expect(within(filasDeTabla()[0]).getByText('De Hombre a Hombre')).toBeInTheDocument()

    await userEvent.click(within(tabla()).getByRole('button', { name: 'Ordenar por equipo' }))
    expect(columna()).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByText('Orden: equipo, descendente')).toBeInTheDocument()
    expect(within(filasDeTabla()[0]).getByText('Punto de Partida')).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?orden=equipo%3Adesc', { scroll: false })
  })
})

describe('ServidoresClient — search, pills and the URL (criteria 7 and 8)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('searches by name (no accents) and phone; the URL follows after a short debounce', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<ServidoresClient {...props({ filas: filasConexion })} />)

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'perez')
    expect(nombresEnTabla()).toEqual([expect.stringContaining('Edith Pérez')])
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?q=perez', { scroll: false })

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar' }))
    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), '5070815')
    expect(nombresEnTabla()).toEqual([expect.stringContaining('Edmir Muñoz')])
  })

  it('lists every active filter as a pill; the X removes just that one; "Limpiar todo" removes all', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await userEvent.click(screen.getByRole('button', { name: /^Activo/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sin cuenta · 28' }))
    const pastillas = screen.getByRole('list', { name: 'Filtros activos' })
    expect(within(pastillas).getAllByRole('button').map((b) => b.textContent)).toEqual(['Etapa: Activo', 'Sin cuenta', 'Limpiar todo'])

    await userEvent.click(within(pastillas).getByRole('button', { name: 'Quitar el filtro Sin cuenta' }))
    expect(within(pastillas).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Activo/ })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(pastillas).getByRole('button', { name: 'Limpiar todo' }))
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).not.toBeInTheDocument()
    expect(filasDeTabla()).toHaveLength(38)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores', { scroll: false })
  })

  it('opens with the filters of a shared URL, legacy ?equipo= and ?estado= included', () => {
    const filtrosIniciales = leerFiltrosDeUrl(new URLSearchParams(`equipo=${ID_DHAH}&estado=activo&agrupar=equipo`))
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales })} />)

    expect(screen.getByRole('button', { name: /^Activo/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Equipo')).toHaveValue(ID_DHAH)
    expect(screen.getByLabelText('Dirección')).toHaveValue(ID_CONEXION)
    expect(screen.getByRole('button', { name: 'Por equipo' })).toHaveAttribute('aria-pressed', 'true')
    const pastillas = screen.getByRole('list', { name: 'Filtros activos' })
    expect(within(pastillas).getByText('Equipo: De Hombre a Hombre')).toBeInTheDocument()
    expect(within(tabla()).getByRole('rowheader', { name: /De Hombre a Hombre/ })).toHaveTextContent('8 personas')
  })
})

describe('ServidoresClient — phone and account status (criterion 6)', () => {
  const filaDe = (nombre: string) => filasDeTabla().find((r) => within(r).queryByText(nombre)) as HTMLElement

  it('links a canonical mobile to WhatsApp in a new tab, formatted 0412 545 7346', () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '04125457346' })]
    render(<ServidoresClient {...props({ filas })} />)
    const enlace = within(filaDe('Ana Ruiz')).getByRole('link', { name: /0412 545 7346/ })
    expect(enlace).toHaveAttribute('href', 'https://wa.me/584125457346')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(filaDe('Ana Ruiz')).queryByText('Revisar teléfono')).not.toBeInTheDocument()
  })

  it('shows a recognizable landline formatted, without a WhatsApp link', () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '02515551234' })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Ana Ruiz')).getByText('0251 555 1234')).toBeInTheDocument()
    expect(within(filaDe('Ana Ruiz')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows an unrecognizable number as given, with a "Revisar teléfono" mark and no link', () => {
    const filas = [fila('1', 'Wito González', ID_DHAH, 'Facilitador', { telefono: '+17867312193' })]
    render(<ServidoresClient {...props({ filas })} />)
    const celda = filaDe('Wito González')
    expect(within(celda).getByText('+17867312193')).toBeInTheDocument()
    expect(within(celda).getByText('Revisar teléfono')).toBeInTheDocument()
    expect(within(celda).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows nothing about the phone when there is none', () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: null }), fila('2', 'Blanca Sin', ID_DHAH, 'Facilitador', { telefono: '  ' })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(tabla()).queryByRole('link')).not.toBeInTheDocument()
    expect(within(tabla()).queryByText('Revisar teléfono')).not.toBeInTheDocument()
    expect(within(tabla()).queryByText(/teléfono/i)).not.toBeInTheDocument()
  })

  it('marks "Sin cuenta" only when the person is known to have no account, and "N equipos" when they serve in several', () => {
    const filas = [
      fila('1', 'Sin Cuenta', ID_DHAH, 'Facilitador', { tieneCuenta: false }),
      fila('2', 'Con Cuenta', ID_DHAH, 'Facilitador', { tieneCuenta: true }),
      fila('3', 'Cuenta Ignorada', ID_DHAH, 'Facilitador', { tieneCuenta: null }),
      fila('4', 'Dos Equipos', ID_DHAH, 'Facilitador', { tieneCuenta: true }),
      fila('5', 'Dos Equipos', ID_PDP, 'Facilitador', { tieneCuenta: true }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Sin Cuenta')).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(filaDe('Con Cuenta')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(filaDe('Cuenta Ignorada')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(filaDe('Dos Equipos')).getByText('2 equipos')).toBeInTheDocument()
  })

  it('a Grupos de Vida leader shows phone and "Sin cuenta" like any row, and counts for the quick filter, but has no menu', async () => {
    const filas = [
      fila('g', 'Marta Ruiz', ID_DHAH, 'Líder de grupo', {
        origen: 'grupos_vida',
        servicioId: undefined,
        version: undefined,
        editable: false,
        telefono: '04245551111',
        tieneCuenta: false,
      }),
    ]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    const celda = filaDe('Marta Ruiz')
    expect(within(celda).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(celda).getByRole('link', { name: /0424 555 1111/ })).toHaveAttribute('href', 'https://wa.me/584245551111')
    expect(within(celda).queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sin cuenta · 1' })).toBeInTheDocument()
  })

  it('finds a person by phone, however the number is typed', async () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '04125457346' }),
      fila('2', 'Luis Paz', ID_DHAH, 'Facilitador', { telefono: '04245551111' }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), '0412 545')
    expect(nombresEnTabla()).toEqual([expect.stringContaining('Ana Ruiz')])
  })
})

describe('ServidoresClient — Grupos de Vida directors', () => {
  const filaDe = (nombre: string) => filasDeTabla().find((r) => within(r).queryByText(nombre)) as HTMLElement
  const director = (clave: string, nombre: string, rol: string, extra: Partial<FilaServidor> = {}) =>
    fila(clave, nombre, ID_DHAH, rol, {
      origen: 'grupos_vida',
      servicioId: undefined,
      version: undefined,
      editable: false,
      fechaInicio: null,
      ...extra,
    })

  it('shows a director with role, team, phone and account mark, and no row menu', () => {
    const filas = [director('de', 'Yara Etapa', 'Director de etapa', { telefono: '04245551111', tieneCuenta: false })]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    const celda = filaDe('Yara Etapa')
    expect(within(celda).getByText('Director de etapa')).toBeInTheDocument()
    expect(within(celda).getByText('De Hombre a Hombre')).toBeInTheDocument()
    expect(within(celda).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(celda).getByRole('link', { name: /0424 555 1111/ })).toHaveAttribute('href', 'https://wa.me/584245551111')
    expect(within(celda).queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
  })

  it('shows a dash, never a 1970 date, when the director has no start date', () => {
    const filas = [
      director('de', 'Yara Etapa', 'Director de etapa'),
      director('dg', 'Zoe General', 'Director general', { fechaInicio: '2026-09-10T10:00:00Z' }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Yara Etapa')).getByText('—')).toBeInTheDocument()
    expect(filaDe('Yara Etapa')).not.toHaveTextContent('1970')
    expect(within(filaDe('Zoe General')).queryByText('—')).not.toBeInTheDocument()
    expect(filaDe('Zoe General')).toHaveTextContent('2026')
  })

  it('offers the director roles in the role filter, hierarchy first', async () => {
    const filas = [
      director('l', 'Xena Lider', 'Líder de grupo'),
      director('de', 'Yara Etapa', 'Director de etapa'),
      director('dg', 'Zoe General', 'Director general'),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
    const selector = screen.getByRole('combobox', { name: 'Rol' })
    const opciones = within(selector).getAllByRole('option').map((o) => o.textContent)
    expect(opciones.slice(-3)).toEqual(['Director general', 'Director de etapa', 'Líder de grupo'])
  })
})

describe('ServidoresClient — phone', () => {
  const tarjetas = () => screen.getByRole('list', { name: 'Servicios en tarjetas' })
  const tarjetaDe = (nombre: string) =>
    within(tarjetas()).getAllByRole('listitem').find((li) => within(li).queryByText(nombre)) as HTMLElement
  const botonFiltros = () => screen.getByRole('button', { name: /^Filtros/ })

  it('scrolls the etapa pills horizontally instead of wrapping', () => {
    render(<ServidoresClient {...props()} />)
    expect(screen.getByRole('group', { name: 'Filtrar por etapa' })).toHaveClass('overflow-x-auto')
  })

  it('renders each servicio as a card: name, equipo · rol, etapa, marks and phone', () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Coordinador', { telefono: '04125457346', tieneCuenta: false, estado: 'en_pausa' }),
      fila('2', 'Ana Ruiz', ID_PDP, 'Facilitador', { telefono: '04125457346', tieneCuenta: false }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(tarjetas()).getAllByRole('listitem')).toHaveLength(2)
    const tarjeta = within(tarjetas()).getAllByRole('listitem')[0]
    expect(within(tarjeta).getByText('Ana Ruiz')).toBeInTheDocument()
    expect(within(tarjeta).getByText('De Hombre a Hombre · Coordinador')).toBeInTheDocument()
    expect(within(tarjeta).getByText('En pausa')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(tarjeta).getByText('2 equipos')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: /0412 545 7346/ })).toHaveAttribute('href', 'https://wa.me/584125457346')
  })

  it('cards carry the same menu as the table rows, and none for read-only viewers or Grupos de Vida leaders', async () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador'),
      fila('2', 'Marta Ruiz', ID_DHAH, 'Líder de grupo', { origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false }),
    ]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    expect(within(tarjetaDe('Marta Ruiz')).queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
    await userEvent.click(within(tarjetaDe('Ana Ruiz')).getByRole('button', { name: 'Acciones para Ana Ruiz' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Cambiar etapa', 'Ver su equipo'])
  })

  it('has a "Filtros" button that counts the filters it holds and opens a bottom sheet with Equipo, Rol and the quick filters', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    expect(botonFiltros()).toHaveTextContent(/^Filtros$/)

    await userEvent.click(botonFiltros())
    const hoja = screen.getByRole('dialog', { name: 'Filtros' })
    expect(within(hoja).getByLabelText('Equipo')).toBeInTheDocument()
    expect(within(hoja).getByLabelText('Rol')).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Sin cuenta · 31' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(hoja).getByRole('button', { name: 'En varios equipos · 4' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Limpiar' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Ver 38' })).toBeInTheDocument()
  })

  it('the sheet filters live, "Ver N" shows the result count and closes, "Limpiar" empties the sheet filters', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await userEvent.click(botonFiltros())
    let hoja = screen.getByRole('dialog', { name: 'Filtros' })

    await userEvent.selectOptions(within(hoja).getByLabelText('Equipo'), ID_PDP)
    await userEvent.click(within(hoja).getByRole('button', { name: /^Sin cuenta/ }))
    expect(within(hoja).getByRole('button', { name: 'Ver 13' })).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith(
      `/admin/dream-team/servidores?direccion=${ID_CONEXION}&equipo=${ID_PDP}&sin_cuenta=1`,
      { scroll: false },
    )

    await userEvent.click(within(hoja).getByRole('button', { name: 'Limpiar' }))
    expect(within(hoja).getByRole('button', { name: 'Ver 38' })).toBeInTheDocument()
    await userEvent.selectOptions(within(hoja).getByLabelText('Rol'), 'Coordinador')
    await userEvent.click(within(hoja).getByRole('button', { name: 'Ver 4' }))
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    expect(botonFiltros()).toHaveTextContent('Filtros · 1')
    expect(within(tarjetas()).getAllByRole('listitem')).toHaveLength(4)

    await userEvent.click(botonFiltros())
    hoja = screen.getByRole('dialog', { name: 'Filtros' })
    expect(within(hoja).getByLabelText('Rol')).toHaveValue('Coordinador')
  })
})

describe('ServidoresClient — empty states', () => {
  it('says when no servicio matches, keeps the pills and offers to clear', async () => {
    render(<ServidoresClient {...props()} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'nadie-coincide')
    expect(screen.getByText('Ningún servicio coincide con estos filtros')).toBeInTheDocument()
    expect(screen.getByText('Quita alguno de los filtros o usa «Limpiar todo».')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Servicios' })).not.toBeInTheDocument()
  })

  it('says so when there are no servicios at all', () => {
    render(<ServidoresClient {...props({ filas: [] })} />)
    expect(screen.getByText('No hay servicios registrados')).toBeInTheDocument()
  })
})

describe('ServidoresClient — row menu and assigner', () => {
  const menuDe = (nombre: string) => within(tabla()).getByRole('button', { name: `Acciones para ${nombre}` })

  it('read-only viewers get no menu and no "Asignar servicio"', () => {
    const soloLectura = filasConexion.map((f) => ({ ...f, editable: false }))
    render(<ServidoresClient {...props({ filas: soloLectura, puedeEditar: false })} />)
    expect(screen.queryByRole('button', { name: /^Acciones para / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Asignar servicio' })).not.toBeInTheDocument()
  })

  it('an editor gets a 44px menu with "Cambiar etapa" and "Ver su equipo" (no per-row button)', async () => {
    const editable = filasConexion.map((f) => ({ ...f, editable: true }))
    render(<ServidoresClient {...props({ filas: editable, puedeEditar: true })} />)
    expect(screen.queryByRole('button', { name: 'Cambiar etapa' })).not.toBeInTheDocument()
    expect(within(tabla()).getAllByRole('button', { name: /^Acciones para / })).toHaveLength(38)
    expect(menuDe('Luis Barrios')).toHaveClass('h-11', 'w-11')

    await userEvent.click(menuDe('Luis Barrios'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Cambiar etapa', 'Ver su equipo'])
    expect(screen.getByRole('menuitem', { name: 'Ver su equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo?direccion=dir-conexion')

    await userEvent.click(screen.getByRole('menuitem', { name: 'Cambiar etapa' }))
    expect(screen.getByText('Etapa actual: En orientación')).toBeInTheDocument()
  })

  it('a retired servicio only offers "Ver su equipo"; a Grupos de Vida leader has no menu at all', async () => {
    const filas: FilaServidor[] = [
      fila('r', 'Rita Retirada', ID_DHAH, 'Facilitador', { estado: 'retirado', editable: true }),
      fila('g', 'Marta Ruiz', ID_DHAH, 'Líder de grupo', { origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false }),
    ]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    expect(screen.queryByRole('button', { name: 'Acciones para Marta Ruiz' })).not.toBeInTheDocument()
    expect(within(tabla()).getByText('Grupos de Vida')).toBeInTheDocument()

    await userEvent.click(menuDe('Rita Retirada'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Ver su equipo'])
  })

  it('opens the assigner from the primary action, and its Equipo select never lists a virtual Grupos de Vida node', async () => {
    const arbolConGdv = [
      ...arbolServidores,
      {
        equipo: { origen: 'grupos_vida' as const, tipo: 'segmento' as const, id: 'segmento-1', label: 'Matrimonios', activo: true, responsables: [] },
        hijos: [],
        nivel: 0,
      },
    ]
    render(<ServidoresClient {...props({ arbol: arbolConGdv, puedeEditar: true })} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Asignar servicio' })[0])

    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByRole('heading', { name: 'Asignar servicio' })).toBeInTheDocument()
    const opciones = Array.from((within(dialogo).getByLabelText('Equipo') as HTMLSelectElement).options).map((o) => o.text)
    expect(opciones).toContain('— Coro')
    expect(opciones).not.toContain('Matrimonios')
  })
})
