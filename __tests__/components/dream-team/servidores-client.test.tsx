/**
 * `<ServidoresClient>` — island for /admin/dream-team/servidores, on design
 * system v2 (T6 of odd/tasks/sistema-diseno-v2.md, parity checklist L3).
 *
 * Rewritten from the previous suite (etapa counters on screen, a filter bar
 * with Dirección/Área selects, "Agrupar" with "Por equipo", a table plus phone
 * cards, a per-row "⋯" menu): every case keeps its intent through the new
 * public interface — the attention metrics, the scope cards and breadcrumbs,
 * the filters sheet, the chips, the `ListaResponsiva` rows and the person
 * detail drawer that holds the actions.
 *
 * Fixture: tests/helpers/servidores-conexion.ts (Conexión: 38 servicios, 36
 * personas, 31 without an account, Jose Jimenez and Antholy Ludovic with two
 * servicios each) plus a second dirección (Alabanza, two servicios).
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them, jsdom applies none), so rows are found through their
 * "Abrir …" button instead of by name text.
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
  ID_MDH,
  ID_PAREJAS,
  ID_PDP,
  ID_TALLERES,
  arbolServidores,
  fila,
  todasLasFilas,
  filasConexion,
} from '@/tests/helpers/servidores-conexion'

const replace = jest.fn()
let campusActivoId: string | null = null

jest.mock('@/hooks/useCampus', () => ({
  useCampus: () => ({ campusId: campusActivoId }),
}))
const refresh = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
}))

// PaginaSistema renders DesktopHeader behind React.lazy + Suspense; this
// synchronous double shows the title, the breadcrumbs and the header actions.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({
    titulo,
    accionPrincipal,
    breadcrumbs,
  }: {
    titulo?: string
    accionPrincipal?: React.ReactNode
    breadcrumbs?: React.ReactNode
  }) => (
    <header>
      {breadcrumbs}
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))

// Re-rendering 40 rows on every filter change is most of each test; on a
// loaded machine CPU contention stretches that past Jest's 5 s default.
jest.setTimeout(15_000)

// `delay: null` skips the macrotask userEvent v14 schedules between actions.
let user: ReturnType<typeof userEvent.setup>

beforeEach(() => {
  campusActivoId = null
  replace.mockClear()
  refresh.mockClear()
  user = userEvent.setup({ delay: null })
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

/** "Por servicio": one row per servicio (the default is one row per person). */
const PLANO = { ...FILTROS_INICIALES, agrupar: 'ninguno' as const }

// `hidden`: an open sheet marks the page behind it aria-hidden, and the list must still be read.
const lista = () => screen.getByRole('table', { name: /^(Servidores|Servicios)$/, hidden: true })
/** The open buttons of the rows, in order; one per row. */
const botonesDeFila = () => within(lista()).queryAllByRole('button', { name: /^Abrir /, hidden: true })
const cantidadDeFilas = () => botonesDeFila().length
const nombresEnLista = () => botonesDeFila().map((boton) => (boton.getAttribute('aria-label') ?? '').replace(/^Abrir /, ''))
const filaDe = (nombre: string) =>
  within(lista()).getByRole('button', { name: `Abrir ${nombre}`, hidden: true }).closest('[role="row"]') as HTMLElement
const pie = () => screen.getByText(/servicios? · \d+ personas?|personas? · \d+ servicios?/)
/** A scope card (dirección or equipo) by the start of its accessible name. */
const tarjeta = (label: string) =>
  within(screen.getByRole('group', { name: /^(Direcciones|Equipos)$/ })).getByRole('button', {
    name: (nombre) => nombre.startsWith(label),
  })
const metrica = (etiqueta: string) =>
  within(screen.getByRole('group', { name: 'Necesitan atención', hidden: true })).getByRole('button', {
    name: (nombre) => nombre.startsWith(etiqueta),
    hidden: true,
  })
const migas = () => screen.getByRole('navigation', { name: 'Ubicación' })
async function abrirFiltros() {
  await user.click(screen.getAllByRole('button', { name: /^Filtros/ })[0])
  return screen.getByRole('dialog', { name: 'Filtros' })
}
async function abrirDetalle(nombre: string) {
  await user.click(within(lista()).getByRole('button', { name: `Abrir ${nombre}`, hidden: true }))
  return screen.getByRole('dialog', { name: nombre })
}

describe('ServidoresClient — attention metrics as filters (S6)', () => {
  it('shows Sirviendo, Por activar, Sin cuenta and Sin turno counting people in the scope', () => {
    render(<ServidoresClient {...props()} />)
    expect(metrica('Sirviendo')).toHaveTextContent('35')
    expect(metrica('Sirviendo')).toHaveTextContent('92% del equipo')
    expect(metrica('Por activar')).toHaveTextContent('2')
    expect(metrica('Sin cuenta')).toHaveTextContent('32')
    expect(metrica('Sin turno')).toHaveTextContent('38')
    for (const etiqueta of ['Sirviendo', 'Por activar', 'Sin cuenta', 'Sin turno']) {
      expect(metrica(etiqueta)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('pressing a metric filters the list and the URL; pressing it again clears it', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    await user.click(metrica('Por activar'))
    expect(metrica('Por activar')).toHaveAttribute('aria-pressed', 'true')
    expect(nombresEnLista().map((n) => n.replace(/ en .*$/, '')).sort()).toEqual(['Luis Barrios', 'Wilennys García'])
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?por_activar=1&agrupar=ninguno', { scroll: false })

    await user.click(metrica('Por activar'))
    expect(cantidadDeFilas()).toBe(38)

    await user.click(metrica('Sirviendo'))
    expect(cantidadDeFilas()).toBe(35)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?etapa=activo&agrupar=ninguno', { scroll: false })

    await user.click(metrica('Sirviendo'))
    await user.click(metrica('Sin turno'))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?turno=sin_turno&agrupar=ninguno', { scroll: false })
  })

  it('the numbers follow the scope', async () => {
    render(<ServidoresClient {...props()} />)
    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(tarjeta('Punto de Partida'))
    expect(metrica('Por activar')).toHaveTextContent('1')
    expect(metrica('Sirviendo')).toHaveTextContent('13')
  })
})

describe('ServidoresClient — etapa pills in the filters sheet (criterion 1)', () => {
  it('shows one pill per etapa with its count, reacting to the rest of the filters', async () => {
    render(<ServidoresClient {...props()} />)
    let hoja = await abrirFiltros()
    expect(within(hoja).getByRole('button', { name: 'Todas 40' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(hoja).getByRole('button', { name: 'Activo 37' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'En orientación 2' })).toBeInTheDocument()
    expect(within(hoja).getAllByRole('button', { name: /^(Postulado|En orientación|Activo|En pausa|Inactivo|Retirado) \d+$/ })).toHaveLength(6)
    await user.click(within(hoja).getByRole('button', { name: /^Ver / }))

    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(tarjeta('Punto de Partida'))
    hoja = await abrirFiltros()
    expect(within(hoja).getByRole('button', { name: 'Activo 13' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'En pausa 0' })).toBeInTheDocument()
  })

  it('tapping Activo filters, tapping it again removes the filter; the URL follows', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    const hoja = await abrirFiltros()
    const activo = within(hoja).getByRole('button', { name: 'Activo 35' })

    await user.click(activo)
    expect(activo).toHaveAttribute('aria-pressed', 'true')
    expect(cantidadDeFilas()).toBe(35)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?etapa=activo&agrupar=ninguno', { scroll: false })

    await user.click(activo)
    expect(activo).toHaveAttribute('aria-pressed', 'false')
    expect(cantidadDeFilas()).toBe(38)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?agrupar=ninguno', { scroll: false })
  })
})

describe('ServidoresClient — tree navigation: cards, breadcrumbs, back (criterion 2)', () => {
  it('without a dirección the cards are the direcciones; tapping one enters it and shows the breadcrumbs', async () => {
    render(<ServidoresClient {...props({ filtrosIniciales: PLANO })} />)
    expect(tarjeta('Todas las direcciones')).toHaveAttribute('aria-pressed', 'true')
    expect(tarjeta('Todas las direcciones')).toHaveTextContent('38personas')
    expect(tarjeta('Dirección de Conexión')).toHaveTextContent('Dirige Antholy Ludovic Gómez')
    expect(screen.queryByRole('navigation', { name: 'Ubicación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Volver a / })).not.toBeInTheDocument()

    await user.click(tarjeta('Dirección de Conexión'))
    expect(cantidadDeFilas()).toBe(38)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?direccion=dir-conexion&agrupar=ninguno', { scroll: false })
    expect(within(migas()).getByRole('button', { name: 'Servidores' })).toBeInTheDocument()
    expect(within(migas()).getByText('Dirección de Conexión')).toHaveAttribute('aria-current', 'page')
    // The hero (desktop) and the large title (phone) carry the same summary.
    const resumenes = screen.getAllByText(/Dirige Antholy Ludovic Gómez · /, { selector: 'p' })
    expect(resumenes).toHaveLength(2)
    for (const resumen of resumenes) expect(resumen).toHaveTextContent('Dirige Antholy Ludovic Gómez · 36 personas · 38 servicios')
  })

  it('inside the dirección the cards are its teams; an equipo card filters by it', async () => {
    render(<ServidoresClient {...props()} />)
    await user.click(tarjeta('Dirección de Conexión'))
    const nombres = within(screen.getByRole('group', { name: 'Equipos' }))
      .getAllByRole('button')
      .map((boton) => boton.querySelector('span span')?.textContent)
    expect(nombres).toEqual(['Toda la dirección', 'De Hombre a Hombre', 'Mujer de Hoy', 'Parejas', 'Punto de Partida'])
    expect(tarjeta('Punto de Partida')).toHaveTextContent('Coordina Jose Jimenez')
    expect(tarjeta('Punto de Partida')).toHaveTextContent('1 por activar')
  })

  it('breadcrumbs and the phone back button go up one level; "Toda la dirección" removes only the equipo', async () => {
    render(<ServidoresClient {...props()} />)
    await user.click(tarjeta('Dirección de Alabanza'))
    await user.click(tarjeta('Coro'))
    expect(tarjeta('Coro')).toHaveAttribute('aria-pressed', 'true')
    expect(nombresEnLista().sort()).toEqual(['Sara Ponce', 'Tomás Rey'])
    expect(replace).toHaveBeenLastCalledWith(`/admin/dream-team/servidores?direccion=dir-alabanza&equipo=${ID_CORO}`, { scroll: false })
    expect(within(migas()).getAllByRole('listitem').map((li) => li.textContent?.replace('/', ''))).toEqual([
      'Servidores',
      'Dirección de Alabanza',
      'Coro',
    ])

    await user.click(screen.getByRole('button', { name: 'Volver a Dirección de Alabanza' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?direccion=dir-alabanza', { scroll: false })

    await user.click(tarjeta('Coro'))
    await user.click(tarjeta('Toda la dirección'))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?direccion=dir-alabanza', { scroll: false })

    await user.click(within(migas()).getByRole('button', { name: 'Servidores' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores', { scroll: false })
    expect(cantidadDeFilas()).toBe(38)
  })

  it('an área in the URL shows every level in the breadcrumbs and narrows cards and rows to it', () => {
    const filtrosIniciales = leerFiltrosDeUrl(new URLSearchParams(`direccion=${ID_CONEXION}&area=${ID_TALLERES}&agrupar=ninguno`))
    render(<ServidoresClient {...props({ filtrosIniciales })} />)
    expect(within(migas()).getAllByRole('listitem').map((li) => li.textContent?.replace('/', ''))).toEqual([
      'Servidores',
      'Dirección de Conexión',
      'Talleres',
    ])
    expect(tarjeta('Todo Talleres')).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Equipos' })).getAllByRole('button')).toHaveLength(5)
    expect(cantidadDeFilas()).toBe(37)
    expect(screen.getByRole('button', { name: 'Volver a Dirección de Conexión' })).toBeInTheDocument()
  })
})

describe('ServidoresClient — atención filters in the sheet (criterion 3)', () => {
  it('"Sin cuenta" leaves 31 of 38 servicios in Conexión', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    const hoja = await abrirFiltros()
    const sinCuenta = within(hoja).getByRole('button', { name: 'Sin cuenta 31' })
    expect(sinCuenta).toHaveAttribute('aria-pressed', 'false')
    expect(within(hoja).getByRole('button', { name: 'En varios equipos 2' })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: /^Sin turno/ })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: /^Por activar/ })).toBeInTheDocument()

    await user.click(sinCuenta)
    expect(cantidadDeFilas()).toBe(31)
    expect(pie()).toHaveTextContent('31 servicios · 31 personas')
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?sin_cuenta=1&agrupar=ninguno', { scroll: false })
    expect(metrica('Sin cuenta')).toHaveAttribute('aria-pressed', 'true')
  })

  it('"En varios equipos" lists only people with two or more servicios', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    const hoja = await abrirFiltros()
    await user.click(within(hoja).getByRole('button', { name: 'En varios equipos 2' }))
    expect(cantidadDeFilas()).toBe(4)
    expect(pie()).toHaveTextContent('4 servicios · 2 personas')
  })
})

describe('ServidoresClient — one row per person (default "Por persona")', () => {
  const gdv = { origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false, tieneCuenta: false } as const
  // José Giménez directs five Grupos de Vida segments: one person, five servicios.
  const cincoServicios = [
    fila('g1', 'José Giménez', ID_CONEXION, 'Director general', { ...gdv, telefono: '04245551111' }),
    fila('g2', 'José Giménez', ID_DHAH, 'Director general', { ...gdv, telefono: '04245551111' }),
    fila('g3', 'José Giménez', ID_PAREJAS, 'Director general', { ...gdv, telefono: '04245551111' }),
    fila('g4', 'José Giménez', ID_PDP, 'Director general', { ...gdv, telefono: '04245551111' }),
    fila('g5', 'José Giménez', ID_MDH, 'Director general', { ...gdv, telefono: '04245551111' }),
  ]

  it('is the default: "Por persona" is pressed, the URL stays bare, one row per person', () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    expect(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Por persona' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('table', { name: 'Servidores' })).toBeInTheDocument()
    expect(cantidadDeFilas()).toBe(36)
    expect(within(lista()).getByRole('columnheader', { name: /Sirve en/ })).toBeInTheDocument()
  })

  it('shows the person once with a chip per servicio, without "2 equipos"', () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const jose = filaDe('Jose Jimenez')
    expect(within(jose).getByTitle('De Hombre a Hombre · Facilitador · Activo')).toBeInTheDocument()
    expect(within(jose).getByTitle('Punto de Partida · Coordinador · Activo')).toBeInTheDocument()
    expect(within(jose).getAllByText('0426 366 7378')).toHaveLength(1)
    expect(within(jose).queryByText('2 equipos')).not.toBeInTheDocument()
    // Phone row: the first servicio and how many more.
    expect(within(jose).getByText('De Hombre a Hombre · Facilitador · +1')).toBeInTheDocument()
  })

  it('shows "Sin cuenta" and "Grupos de Vida" once, three servicio chips and "+2 más"', () => {
    render(<ServidoresClient {...props({ filas: cincoServicios })} />)
    const jose = filaDe('José Giménez')
    expect(within(jose).getAllByTitle(/· Director general · Activo$/)).toHaveLength(3)
    expect(within(jose).getByText('+2 más')).toBeInTheDocument()
    expect(within(jose).getAllByText('Grupos de Vida')).toHaveLength(1)
    // Once on the desktop cell, once on the phone row (each layout shows one of them).
    expect(within(jose).getAllByText('Sin cuenta')).toHaveLength(2)
  })

  it('lists only the servicios that pass the filters; a person with none disappears', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(tarjeta('Punto de Partida'))
    const jose = filaDe('Jose Jimenez')
    expect(within(jose).getByTitle('Punto de Partida · Coordinador · Activo')).toBeInTheDocument()
    expect(within(jose).queryByTitle(/^De Hombre a Hombre/)).not.toBeInTheDocument()
    expect(nombresEnLista()).not.toContain('Edith Pérez')
    expect(pie()).toHaveTextContent('14 personas · 14 servicios')
  })

  it('"Por servicio" lists one row per servicio and goes back with "Por persona"; the footer follows', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    expect(pie()).toHaveTextContent('36 personas · 38 servicios')
    const vista = screen.getByRole('group', { name: 'Vista' })

    await user.click(within(vista).getByRole('button', { name: 'Por servicio' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?agrupar=ninguno', { scroll: false })
    expect(screen.getByRole('table', { name: 'Servicios' })).toBeInTheDocument()
    expect(cantidadDeFilas()).toBe(38)
    expect(pie()).toHaveTextContent('38 servicios · 36 personas')
    expect(nombresEnLista().filter((n) => n.startsWith('Jose Jimenez'))).toEqual([
      'Jose Jimenez en De Hombre a Hombre',
      'Jose Jimenez en Punto de Partida',
    ])

    await user.click(within(vista).getByRole('button', { name: 'Por persona' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores', { scroll: false })
    expect(nombresEnLista().filter((n) => n.startsWith('Jose Jimenez'))).toEqual(['Jose Jimenez'])
  })

  it('"Agrupar por equipo" is gone: no such option, and an old ?agrupar=equipo link opens "Por persona"', async () => {
    const filtrosIniciales = leerFiltrosDeUrl(new URLSearchParams('agrupar=equipo'))
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales })} />)
    expect(screen.queryByRole('button', { name: 'Por equipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Agrupar' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Por persona' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const hoja = await abrirFiltros()
    expect(within(within(hoja).getByRole('group', { name: 'Vista de la lista' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Por persona',
      'Por servicio',
    ])
  })
})

describe('ServidoresClient — sorting (criterion 5)', () => {
  it('sorting by "Sirve en" (equipo) and tapping again reverses it; aria-sort and the footer say so', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    const columna = () => within(lista()).getByRole('columnheader', { name: /Equipo · rol/ })
    expect(within(lista()).getByRole('columnheader', { name: /Persona/ })).toHaveAttribute('aria-sort', 'ascending')

    await user.click(within(columna()).getByRole('button'))
    expect(columna()).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('Orden: equipo, ascendente')).toBeInTheDocument()
    expect(nombresEnLista()[0]).toMatch(/ en De Hombre a Hombre$/)

    await user.click(within(columna()).getByRole('button'))
    expect(columna()).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByText('Orden: equipo, descendente')).toBeInTheDocument()
    expect(nombresEnLista()[0]).toMatch(/ en Punto de Partida$/)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?agrupar=ninguno&orden=equipo%3Adesc', { scroll: false })
  })

  it('the sheet sorts by every column (rol and inicio included), a second tap flips the direction', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const hoja = await abrirFiltros()
    const orden = within(hoja).getByRole('group', { name: 'Ordenar la lista' })
    expect(within(orden).getAllByRole('button').map((b) => b.textContent)).toEqual(['Persona ↑', 'Equipo', 'Rol', 'Etapa', 'Inicio'])

    await user.click(within(orden).getByRole('button', { name: 'Rol' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?orden=rol', { scroll: false })
    expect(nombresEnLista()[0]).toBe('Antholy Ludovic Gómez')
    await user.click(within(orden).getByRole('button', { name: 'Rol ↑' }))
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?orden=rol%3Adesc', { scroll: false })

    await user.click(within(orden).getByRole('button', { name: 'Inicio' }))
    expect(screen.getByText('Orden: inicio, ascendente')).toBeInTheDocument()
  })
})

describe('ServidoresClient — search, chips and the URL (criteria 7 and 8)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('searches by name (no accents) and phone; the URL follows after a short debounce', async () => {
    // With `delay: null` userEvent schedules no timers of its own, so the fake clock only drives the debounce.
    jest.useFakeTimers()
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const buscar = () => screen.getByRole('searchbox', { name: 'Buscar servidores' })

    await user.type(buscar(), 'perez')
    expect(nombresEnLista()).toEqual(['Edith Pérez'])
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      jest.advanceTimersByTime(400)
    })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?q=perez', { scroll: false })

    await user.clear(buscar())
    await user.type(buscar(), '5070815')
    expect(nombresEnLista()).toEqual(['Edmir Muñoz'])
  })

  it('lists every active filter as a chip; its X removes just that one; "Limpiar todo" removes all but the scope', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales: PLANO })} />)
    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(metrica('Sirviendo'))
    await user.click(metrica('Sin cuenta'))
    const chips = screen.getByRole('group', { name: 'Filtros activos' })
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Quitar Etapa: Activo',
      'Quitar Sin cuenta',
      'Limpiar todo',
    ])

    await user.click(within(chips).getByRole('button', { name: 'Quitar Sin cuenta' }))
    expect(metrica('Sin cuenta')).toHaveAttribute('aria-pressed', 'false')
    expect(metrica('Sirviendo')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Filtros activos' })).toHaveTextContent('Etapa: Activo')

    await user.click(metrica('Sin cuenta'))
    await user.click(within(screen.getByRole('group', { name: 'Filtros activos' })).getByRole('button', { name: 'Limpiar todo' }))
    expect(screen.queryByRole('group', { name: 'Filtros activos' })).not.toBeInTheDocument()
    expect(cantidadDeFilas()).toBe(38)
    expect(replace).toHaveBeenLastCalledWith('/admin/dream-team/servidores?direccion=dir-conexion&agrupar=ninguno', { scroll: false })
  })

  it('opens with the filters of a shared URL, legacy ?equipo= and ?estado= included', () => {
    const filtrosIniciales = leerFiltrosDeUrl(new URLSearchParams(`equipo=${ID_DHAH}&estado=activo&agrupar=equipo`))
    render(<ServidoresClient {...props({ filas: filasConexion, filtrosIniciales })} />)

    expect(metrica('Sirviendo')).toHaveAttribute('aria-pressed', 'true')
    expect(tarjeta('De Hombre a Hombre')).toHaveAttribute('aria-pressed', 'true')
    expect(within(migas()).getAllByRole('listitem').map((li) => li.textContent?.replace('/', ''))).toEqual([
      'Servidores',
      'Dirección de Conexión',
      'De Hombre a Hombre',
    ])
    expect(within(screen.getByRole('group', { name: 'Filtros activos' })).getByText('Etapa: Activo')).toBeInTheDocument()
    expect(cantidadDeFilas()).toBe(8)
  })
})

describe('ServidoresClient — phone, WhatsApp and account status (criterion 6)', () => {
  it('a canonical mobile shows formatted in the row; the drawer links it to WhatsApp in a new tab and to a call', async () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '04125457346' })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Ana Ruiz')).getByText('0412 545 7346')).toHaveClass('font-mono')
    expect(within(filaDe('Ana Ruiz')).queryByText('Revisar teléfono')).not.toBeInTheDocument()

    const detalle = await abrirDetalle('Ana Ruiz')
    const whatsapp = within(detalle).getByRole('link', { name: 'WhatsApp' })
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/584125457346')
    expect(whatsapp).toHaveAttribute('target', '_blank')
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(detalle).getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:04125457346')
  })

  it('a landline shows formatted; WhatsApp is disabled, Llamar works', async () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '02515551234' })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Ana Ruiz')).getByText('0251 555 1234')).toBeInTheDocument()
    const detalle = await abrirDetalle('Ana Ruiz')
    expect(within(detalle).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
    expect(within(detalle).getByRole('link', { name: 'Llamar' })).toBeInTheDocument()
  })

  it('an unrecognizable number shows as given with "Revisar teléfono", and the drawer explains and offers the fix', async () => {
    const filas = [fila('1', 'Wito González', ID_DHAH, 'Facilitador', { telefono: '+17867312193', fichaEditable: true })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(filaDe('Wito González')).getByText('+17867312193')).toBeInTheDocument()
    expect(within(filaDe('Wito González')).getByText('Revisar teléfono')).toBeInTheDocument()

    const detalle = await abrirDetalle('Wito González')
    expect(within(detalle).getByText('«+17867312193» no parece un número válido, así que WhatsApp no funciona.')).toBeInTheDocument()
    expect(within(detalle).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
    expect(within(detalle).getByRole('button', { name: 'Corregir en la ficha' })).toBeInTheDocument()
  })

  it('without a phone: "Sin teléfono", no link, both quick actions disabled', async () => {
    const filas = [fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: null }), fila('2', 'Blanca Sin', ID_DHAH, 'Facilitador', { telefono: '  ' })]
    render(<ServidoresClient {...props({ filas })} />)
    expect(within(lista()).queryByRole('link')).not.toBeInTheDocument()
    expect(within(lista()).queryByText('Revisar teléfono')).not.toBeInTheDocument()
    expect(within(filaDe('Blanca Sin')).getByText('Sin teléfono')).toBeInTheDocument()
    const detalle = await abrirDetalle('Ana Ruiz')
    expect(within(detalle).getByRole('button', { name: 'WhatsApp' })).toBeDisabled()
    expect(within(detalle).getByRole('button', { name: 'Llamar' })).toBeDisabled()
  })

  it('marks "Sin cuenta" only when the person is known to have no account', () => {
    const filas = [
      fila('1', 'Sin Cuenta', ID_DHAH, 'Facilitador', { tieneCuenta: false }),
      fila('2', 'Con Cuenta', ID_DHAH, 'Facilitador', { tieneCuenta: true }),
      fila('3', 'Cuenta Ignorada', ID_DHAH, 'Facilitador', { tieneCuenta: null }),
    ]
    render(<ServidoresClient {...props({ filas, filtrosIniciales: PLANO })} />)
    expect(within(filaDe('Sin Cuenta en De Hombre a Hombre')).getAllByText('Sin cuenta').length).toBeGreaterThan(0)
    expect(within(filaDe('Con Cuenta en De Hombre a Hombre')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(filaDe('Cuenta Ignorada en De Hombre a Hombre')).queryByText('Sin cuenta')).not.toBeInTheDocument()
  })

  it('finds a person by phone, however the number is typed', async () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { telefono: '04125457346' }),
      fila('2', 'Luis Paz', ID_DHAH, 'Facilitador', { telefono: '04245551111' }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    await user.type(screen.getByRole('searchbox', { name: 'Buscar servidores' }), '0412 545')
    expect(nombresEnLista()).toEqual(['Ana Ruiz'])
  })
})

describe('ServidoresClient — detail drawer actions, each permission-gated (L3)', () => {
  const servicio = (nombre: string) => within(screen.getByRole('dialog', { name: nombre }))

  it('read-only viewers see the drawer without any action, and no "Asignar servicio"', async () => {
    const soloLectura = filasConexion.map((f) => ({ ...f, editable: false }))
    render(<ServidoresClient {...props({ filas: soloLectura, puedeEditar: false })} />)
    expect(screen.queryByRole('button', { name: 'Asignar servicio' })).not.toBeInTheDocument()
    await abrirDetalle('Luis Barrios')
    const tarjetaServicio = within(servicio('Luis Barrios').getByRole('group', { name: 'De Hombre a Hombre' }))
    expect(tarjetaServicio.queryByRole('button')).not.toBeInTheDocument()
    expect(tarjetaServicio.queryByRole('link')).not.toBeInTheDocument()
    expect(servicio('Luis Barrios').queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument()
  })

  it('an editor gets "Cambiar etapa", "Turnos" and "Ver su equipo" per servicio; "Cambiar etapa" opens the stage dialog', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, puedeEditar: true })} />)
    expect(screen.getAllByRole('button', { name: 'Asignar servicio' }).length).toBeGreaterThan(0)
    await abrirDetalle('Luis Barrios')
    const tarjetaServicio = within(servicio('Luis Barrios').getByRole('group', { name: 'De Hombre a Hombre' }))
    expect(tarjetaServicio.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cambiar etapa', 'Turnos'])
    expect(tarjetaServicio.getByRole('link', { name: 'Ver su equipo' })).toHaveAttribute('href', '/dream-team/mi-equipo?direccion=dir-conexion')
    expect(tarjetaServicio.getByText('En orientación')).toBeInTheDocument()
    expect(tarjetaServicio.getByText('Facilitador')).toBeInTheDocument()

    await user.click(tarjetaServicio.getByRole('button', { name: 'Cambiar etapa' }))
    expect(screen.queryByRole('dialog', { name: 'Luis Barrios' })).not.toBeInTheDocument()
    expect(screen.getByText('Etapa actual: En orientación')).toBeInTheDocument()
  })

  it('shows every servicio of the person, one card each, even those the filters hide', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion, puedeEditar: true })} />)
    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(tarjeta('Punto de Partida'))
    await abrirDetalle('Jose Jimenez')
    expect(servicio('Jose Jimenez').getByText('2 servicios')).toBeInTheDocument()
    expect(servicio('Jose Jimenez').getByRole('group', { name: 'De Hombre a Hombre' })).toBeInTheDocument()
    expect(servicio('Jose Jimenez').getByRole('group', { name: 'Punto de Partida' })).toBeInTheDocument()
  })

  it('a retired servicio only offers "Ver su equipo"; a Grupos de Vida row has no action and says where it is managed', async () => {
    const filas: FilaServidor[] = [
      fila('r', 'Rita Retirada', ID_DHAH, 'Facilitador', { estado: 'retirado', editable: true }),
      fila('g', 'Marta Ruiz', ID_DHAH, 'Líder de grupo', { origen: 'grupos_vida', servicioId: undefined, version: undefined, editable: false }),
    ]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    expect(within(filaDe('Marta Ruiz')).getByText('Grupos de Vida')).toBeInTheDocument()

    await abrirDetalle('Rita Retirada')
    const retirado = within(servicio('Rita Retirada').getByRole('group', { name: 'De Hombre a Hombre' }))
    expect(retirado.queryByRole('button')).not.toBeInTheDocument()
    expect(retirado.getByRole('link', { name: 'Ver su equipo' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await abrirDetalle('Marta Ruiz')
    expect(servicio('Marta Ruiz').getByText('Sus servicios de Grupos de Vida se gestionan desde Grupos de Vida.')).toBeInTheDocument()
    const gdv = within(servicio('Marta Ruiz').getByRole('group', { name: 'De Hombre a Hombre' }))
    expect(gdv.queryByRole('button')).not.toBeInTheDocument()
    expect(gdv.queryByRole('link')).not.toBeInTheDocument()
  })

  it('who may fix the ficha gets "Editar ficha", and "Invitar a la plataforma" for someone without account', async () => {
    const filas = [
      fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { editable: false, fichaEditable: true, tieneCuenta: false }),
      fila('2', 'Beto Paz', ID_DHAH, 'Facilitador', { editable: false, fichaEditable: false, tieneCuenta: false }),
    ]
    // The invite panel loads the invitation state when it opens.
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ estado: { sinCuenta: true, invitacion: null, emailFicha: null } }) })) as unknown as typeof fetch
    render(<ServidoresClient {...props({ filas })} />)
    await abrirDetalle('Ana Ruiz')
    expect(servicio('Ana Ruiz').getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(servicio('Ana Ruiz').getByRole('button', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(servicio('Ana Ruiz').getByRole('button', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
    // The volunteer coordinator keeps the shifts up to date too, but cannot change the stage.
    expect(
      within(servicio('Ana Ruiz').getByRole('group', { name: 'De Hombre a Hombre' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Turnos'])

    await user.click(servicio('Ana Ruiz').getByRole('button', { name: 'Invitar a la plataforma' }))
    expect(await screen.findByRole('dialog', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await abrirDetalle('Beto Paz')
    expect(servicio('Beto Paz').getByText('No tiene cuenta en la plataforma')).toBeInTheDocument()
    expect(servicio('Beto Paz').queryByRole('button', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
    expect(servicio('Beto Paz').queryByRole('button', { name: 'Editar ficha' })).not.toBeInTheDocument()
  })

  it('opens the assigner from the primary action, and its Equipo picker never lists a virtual Grupos de Vida node', async () => {
    const arbolConGdv = [
      ...arbolServidores,
      {
        equipo: { origen: 'grupos_vida' as const, tipo: 'segmento' as const, id: 'segmento-1', label: 'Matrimonios', activo: true, responsables: [] },
        hijos: [],
        nivel: 0,
      },
    ]
    global.fetch = jest.fn(async (url: RequestInfo | URL) =>
      String(url).startsWith('/api/dream-team/usuarios/buscar')
        ? { ok: true, json: async () => [{ id: 'u-1', email: null, nombre: 'Ana', apellido: 'Uno' }] }
        : { ok: true, json: async () => ({ equipos: [] }) },
    ) as unknown as typeof fetch
    render(<ServidoresClient {...props({ arbol: arbolConGdv, puedeEditar: true })} />)
    // The header button on desktop and the floating button on phones.
    expect(screen.getAllByRole('button', { name: 'Asignar servicio' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Asignar servicio' })[0])

    const dialogo = screen.getByRole('dialog', { name: 'Asignar servicio' })
    await user.type(within(dialogo).getByLabelText('Buscar persona'), 'ana')
    await user.click(await within(dialogo).findByRole('button', { name: /Ana Uno/ }))
    await user.click(within(dialogo).getByRole('button', { name: 'Siguiente' }))
    const radios = Array.from(dialogo.querySelectorAll('[role="radio"]')).map((r) => r.getAttribute('aria-label') ?? '')
    expect(radios.some((ruta) => / › Coro$/.test(ruta))).toBe(true)
    expect(radios.some((ruta) => ruta.includes('Matrimonios'))).toBe(false)
  })
})

describe('ServidoresClient — Grupos de Vida directors', () => {
  const director = (clave: string, nombre: string, rol: string, extra: Partial<FilaServidor> = {}) =>
    fila(clave, nombre, ID_DHAH, rol, {
      origen: 'grupos_vida',
      servicioId: undefined,
      version: undefined,
      editable: false,
      fechaInicio: null,
      ...extra,
    })

  it('shows a director with role, team, phone and account mark', () => {
    const filas = [director('de', 'Yara Etapa', 'Director de etapa', { telefono: '04245551111', tieneCuenta: false })]
    render(<ServidoresClient {...props({ filas, puedeEditar: true })} />)
    const celda = filaDe('Yara Etapa')
    expect(within(celda).getByTitle('De Hombre a Hombre · Director de etapa · Activo')).toBeInTheDocument()
    expect(within(celda).getAllByText('Sin cuenta').length).toBeGreaterThan(0)
    expect(within(celda).getByText('0424 555 1111')).toBeInTheDocument()
  })

  it('shows a dash, never a 1970 date, when the director has no start date', async () => {
    const filas = [
      director('de', 'Yara Etapa', 'Director de etapa'),
      director('dg', 'Zoe General', 'Director general', { fechaInicio: '2026-09-10T10:00:00Z' }),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    const desde = (detalle: HTMLElement) => within(detalle).getByText('Desde').nextElementSibling
    let detalle = await abrirDetalle('Yara Etapa')
    expect(desde(detalle)).toHaveTextContent(/^—$/)
    expect(detalle).not.toHaveTextContent('1970')
    await user.keyboard('{Escape}')
    detalle = await abrirDetalle('Zoe General')
    expect(desde(detalle)).toHaveTextContent('2026')
  })

  it('offers the director roles in the role filter, hierarchy first', async () => {
    const filas = [
      director('l', 'Xena Lider', 'Líder de grupo'),
      director('de', 'Yara Etapa', 'Director de etapa'),
      director('dg', 'Zoe General', 'Director general'),
    ]
    render(<ServidoresClient {...props({ filas })} />)
    const hoja = await abrirFiltros()
    const opciones = within(within(hoja).getByRole('combobox', { name: 'Rol' })).getAllByRole('option').map((o) => o.textContent)
    expect(opciones.slice(-3)).toEqual(['Director general', 'Director de etapa', 'Líder de grupo'])
  })
})

describe('ServidoresClient — phone shell', () => {
  it('has a navigation bar with the Filtros button counting the sheet filters, and a large title', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    const barra = screen.getByRole('navigation', { name: 'Navegación de Servidores' })
    expect(within(barra).getByRole('button', { name: 'Filtros' })).toBeInTheDocument()

    await user.click(metrica('Sin cuenta'))
    expect(within(barra).getByRole('button', { name: 'Filtros, 1 activo' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1, name: 'Servidores' }).length).toBeGreaterThan(0)
  })

  it('the sheet filters live; "Ver N personas" counts and closes; "Limpiar" empties the sheet filters but keeps the scope', async () => {
    render(<ServidoresClient {...props({ filas: filasConexion })} />)
    await user.click(tarjeta('Dirección de Conexión'))
    await user.click(tarjeta('Punto de Partida'))
    let hoja = await abrirFiltros()

    await user.click(within(hoja).getByRole('button', { name: /^Sin cuenta/ }))
    expect(within(hoja).getByRole('button', { name: 'Ver 13 personas' })).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith(
      `/admin/dream-team/servidores?direccion=${ID_CONEXION}&equipo=${ID_PDP}&sin_cuenta=1`,
      { scroll: false },
    )

    await user.click(within(hoja).getByRole('button', { name: 'Limpiar' }))
    expect(within(hoja).getByRole('button', { name: 'Ver 14 personas' })).toBeInTheDocument()
    await user.selectOptions(within(hoja).getByLabelText('Rol'), 'Coordinador')
    await user.click(within(hoja).getByRole('button', { name: 'Ver 1 persona' }))
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    expect(cantidadDeFilas()).toBe(1)

    hoja = await abrirFiltros()
    expect(within(hoja).getByLabelText('Rol')).toHaveValue('Coordinador')
  })
})

describe('ServidoresClient — empty states', () => {
  it('says when nobody matches and offers to clear everything', async () => {
    render(<ServidoresClient {...props()} />)
    // Pasted, not typed: each keystroke would re-render the 40 rows.
    await user.click(screen.getByRole('searchbox', { name: 'Buscar servidores' }))
    await user.paste('nadie-coincide')
    expect(screen.getByText('Nadie coincide con estos filtros')).toBeInTheDocument()
    expect(screen.getByText('Quitá alguno o usá «Limpiar todo».')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(cantidadDeFilas()).toBe(38)
    expect(screen.getByRole('searchbox', { name: 'Buscar servidores' })).toHaveValue('')
  })

  it('says so when there are no servicios at all, pointing editors at "Asignar servicio"', () => {
    render(<ServidoresClient {...props({ filas: [], puedeEditar: true })} />)
    expect(screen.getByText('Todavía no hay servidores acá')).toBeInTheDocument()
    expect(screen.getByText('Usá «Asignar servicio» para sumar al primero.')).toBeInTheDocument()
  })
})

describe('ServidoresClient — shift column and campus', () => {
  const T9 = '00000000-0000-4000-8000-000000000009'
  const TCCS = '00000000-0000-4000-8000-000000000017'
  const turnos = [
    { id: T9, campusId: 'bqt', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
    { id: TCCS, campusId: 'ccs', nombre: 'Sábado 17:00', diaSemana: 6, hora: '17:00', orden: 1, activo: true },
  ]
  const filas = [
    fila('1', 'Ana Ruiz', ID_DHAH, 'Facilitador', { turnoIds: [T9] }),
    fila('2', 'Beto Paz', ID_DHAH, 'Facilitador', { turnoIds: [] }),
  ]

  it('shows the shifts as a column (from lg) and in the drawer, with a dash when none', async () => {
    render(<ServidoresClient {...props({ filas, turnos })} />)
    expect(within(lista()).getByRole('columnheader', { name: 'Turno' })).toHaveClass('hidden', 'lg:flex')
    expect(within(filaDe('Ana Ruiz')).getByTitle('Domingo 9:00')).toBeInTheDocument()
    expect(within(filaDe('Beto Paz')).getByTitle('—')).toBeInTheDocument()
    const detalle = await abrirDetalle('Ana Ruiz')
    expect(within(detalle).getByText('Turno').nextElementSibling).toHaveTextContent('Domingo 9:00')
  })

  it('the Turno filter offers only the shifts of the campus selected in the app', async () => {
    campusActivoId = 'bqt'
    render(<ServidoresClient {...props({ filas, turnos })} />)
    const hoja = await abrirFiltros()
    const opciones = Array.from((within(hoja).getByLabelText('Turno') as HTMLSelectElement).options).map((o) => o.text)
    expect(opciones).toEqual(['Todos', 'Domingo 9:00', 'Sin turno'])
  })
})

describe('ServidoresClient — page layout (docs/design-system)', () => {
  it('is a full-width system page titled after the current level', async () => {
    const { container } = render(<ServidoresClient {...props()} />)
    expect((await screen.findAllByRole('heading', { level: 1, name: 'Servidores' })).length).toBeGreaterThan(0)
    expect(container.querySelector('[data-ancho="default"]')).not.toBeNull()
    await user.click(tarjeta('Dirección de Conexión'))
    expect(screen.getAllByRole('heading', { level: 1, name: 'Dirección de Conexión' }).length).toBeGreaterThan(0)
  })
})
