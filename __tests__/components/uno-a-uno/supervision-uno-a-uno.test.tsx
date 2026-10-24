/**
 * @jest-environment jsdom
 *
 * T7/T8 (odd/tasks/uno-a-uno.md) — the "Supervisión" view: the sub-tabs
 * "Líderes" and "1 a 1 recientes" (S8.5); the leaders' counters (S8.1),
 * filters (S8.2), sortable table and phone list (S8.3, S8.4); the recent
 * 1:1s with their estado filter and search (S8.5, S7.2). Read-only and never
 * with the private note. T9: the Dirección → Área → Equipo o grupo filters
 * over each leader's places, in cascade (S9.1, S9.4).
 *
 * The table and the phone list are both rendered (jsdom applies no
 * breakpoints), so assertions are scoped to one of them.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SupervisionUnoAUno } from '@/components/uno-a-uno/supervision-uno-a-uno'
import type { LiderSupervisado, UbicacionLider, UnoAUnoSupervisado } from '@/lib/uno-a-uno/vista'

const GDV = { direccionId: 'd-gdv', direccion: 'Dirección de Grupos de Vida' }
const EXPERIENCIA = { direccionId: 'd-exp', direccion: 'Dirección de Experiencia' }
const NORTE: UbicacionLider = { ...GDV, areaId: 'a-adu', area: 'Adultos', equipoId: 'g-norte', equipo: 'Norte' }
const JOVENES: UbicacionLider = { ...GDV, areaId: 'a-jov', area: 'Jóvenes', equipoId: null, equipo: null }
const SONIDO: UbicacionLider = { ...EXPERIENCIA, areaId: 'a-prod', area: 'Producción', equipoId: 'e-sonido', equipo: 'Sonido' }
const ALABANZA: UbicacionLider = { ...EXPERIENCIA, areaId: 'a-alab', area: 'Alabanza', equipoId: null, equipo: null }

const ana = { id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }
const luis = { id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }
const maria = { id: 'd-2', nombre: 'María', apellido: 'Gómez' }

function lider(over: Partial<LiderSupervisado>): LiderSupervisado {
  return {
    usuarioId: 'l-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    contextos: ['GDV: Norte'],
    dirigidos: 3,
    realizados: 2,
    agendados: 1,
    ultimoRealizado: '2026-10-20T19:30:00Z',
    ubicaciones: [NORTE],
    ...over,
  }
}

function supervisado(over: Partial<UnoAUnoSupervisado>): UnoAUnoSupervisado {
  return {
    id: 's-1',
    estado: 'realizado',
    fechaHora: '2026-10-20T19:30:00Z',
    lugar: null,
    lideres: [ana],
    dirigidos: [luis, maria],
    resumen: null,
    celebracion: null,
    motivoCancelacion: null,
    ...over,
  }
}

// The RPC order: longest without a 1:1 first.
const PEDRO = lider({ usuarioId: 'l-2', nombre: 'Pedro', apellido: 'Ruiz', realizados: 0, agendados: 0, ultimoRealizado: null, dirigidos: 5 })
const JOSE = lider({
  usuarioId: 'l-3',
  nombre: 'José',
  apellido: 'Álvarez',
  contextos: ['Dream Team: Sonido'],
  realizados: 0,
  agendados: 2,
  ultimoRealizado: '2026-08-01T12:00:00Z',
  dirigidos: 1,
  ubicaciones: [SONIDO],
})
const ANA = lider({ contextos: ['GDV: Norte', 'Dream Team: Alabanza'], ubicaciones: [NORTE, ALABANZA] })
const MARTA = lider({
  usuarioId: 'l-4',
  nombre: 'Marta',
  apellido: null,
  contextos: ['Director de etapa: Jóvenes'],
  realizados: 4,
  agendados: 0,
  ultimoRealizado: '2026-10-22T12:00:00Z',
  dirigidos: 8,
  ubicaciones: [JOVENES],
})
const LIDERES = [PEDRO, JOSE, ANA, MARTA]

const tablaLideres = () => screen.getByRole('table', { name: 'Líderes' })
const filasDe = (tabla: HTMLElement) => within(tabla).getAllByRole('row').slice(1)
/** The leader's name of each row, without the "Sin 1 a 1" mark next to it. */
const nombresEnTabla = () =>
  filasDe(tablaLideres()).map((fila) => within(fila).getAllByRole('cell')[0].querySelector('span')?.textContent)
const ordenEsperado = (...nombres: string[]) => nombres
const listaLideres = () => screen.getByRole('list', { name: 'Líderes en lista' })
const mostrando = () => screen.getByText(/^Mostrando \d+ de \d+$/)
const resumen = () => screen.getByRole('group', { name: 'Resumen de líderes' })
const etiquetasDe = (selector: HTMLElement) => within(selector).getAllByRole('option').map((o) => o.textContent)

function renderLideres(lideres: readonly LiderSupervisado[] = LIDERES): void {
  render(<SupervisionUnoAUno lideres={lideres} recientes={[]} />)
}

async function abrirRecientes(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: '1 a 1 recientes' }))
}

describe('SupervisionUnoAUno — sub-tabs (S8.5)', () => {
  it('opens on "Líderes" and switches to "1 a 1 recientes" and back', async () => {
    render(<SupervisionUnoAUno lideres={LIDERES} recientes={[supervisado({})]} />)
    expect(screen.getByRole('tab', { name: 'Líderes' })).toHaveAttribute('aria-selected', 'true')
    expect(tablaLideres()).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '1 a 1 recientes' })).not.toBeInTheDocument()

    await abrirRecientes()
    expect(screen.getByRole('tab', { name: '1 a 1 recientes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('table', { name: '1 a 1 recientes' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Líderes' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Líderes' }))
    expect(tablaLideres()).toBeInTheDocument()
  })
})

describe('SupervisionUnoAUno — Líderes: counters (S8.1)', () => {
  it('shows Líderes N, Sin 1 a 1 en 30 días and Al día', () => {
    renderLideres()
    const grupo = within(resumen())
    expect(grupo.getByRole('button', { name: 'Líderes 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(grupo.getByRole('button', { name: 'Sin 1 a 1 en 30 días 2' })).toHaveAttribute('aria-pressed', 'false')
    expect(grupo.getByRole('button', { name: 'Al día 2' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('filters the table by the counter tapped, and "Líderes" removes the estado filter', async () => {
    renderLideres()
    const grupo = within(resumen())

    await userEvent.click(grupo.getByRole('button', { name: /^Sin 1 a 1 en 30 días/ }))
    expect(nombresEnTabla()).toEqual(ordenEsperado('Pedro Ruiz', 'José Álvarez'))
    expect(grupo.getByRole('button', { name: /^Sin 1 a 1 en 30 días/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Estado')).toHaveValue('sin_uno_a_uno')

    await userEvent.click(grupo.getByRole('button', { name: /^Al día/ }))
    expect(nombresEnTabla()).toEqual(ordenEsperado('Ana Pérez', 'Marta'))

    await userEvent.click(grupo.getByRole('button', { name: /^Líderes/ }))
    expect(nombresEnTabla()).toHaveLength(4)
    expect(screen.getByLabelText('Estado')).toHaveValue('')
  })
})

describe('SupervisionUnoAUno — Líderes: filters (S8.2)', () => {
  it('searches by name ignoring case and accents', async () => {
    renderLideres()
    await userEvent.type(screen.getByLabelText('Buscar'), 'jose alvarez')
    expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez'))
    expect(mostrando()).toHaveTextContent('Mostrando 1 de 4')
  })

  it('no longer offers the old Área "Grupos de Vida" / "Dream Team" nor "Grupo o equipo"', () => {
    renderLideres()
    expect(screen.queryByLabelText('Grupo o equipo')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Dream Team' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Grupos de Vida' })).not.toBeInTheDocument()
  })

  it('filters by Dirección, a leader with places in two direcciones showing under both', async () => {
    renderLideres()
    const direccion = screen.getByLabelText('Dirección')
    expect(etiquetasDe(direccion)).toEqual(['Todas', 'Dirección de Experiencia', 'Dirección de Grupos de Vida'])
    await userEvent.selectOptions(direccion, 'Dirección de Grupos de Vida')
    expect(nombresEnTabla()).toEqual(ordenEsperado('Pedro Ruiz', 'Ana Pérez', 'Marta'))
    await userEvent.selectOptions(direccion, 'Dirección de Experiencia')
    expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez', 'Ana Pérez'))
  })

  it('shows Área only once a Dirección is chosen, with that dirección\'s áreas, and filters by it', async () => {
    renderLideres()
    expect(screen.queryByLabelText('Área')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Dirección'), 'Dirección de Experiencia')
    expect(etiquetasDe(screen.getByLabelText('Área'))).toEqual(['Todas', 'Alabanza', 'Producción'])
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'Alabanza')
    expect(nombresEnTabla()).toEqual(ordenEsperado('Ana Pérez'))
  })

  it('narrows Equipo o grupo to the chosen dirección and área and filters by it', async () => {
    renderLideres()
    expect(etiquetasDe(screen.getByLabelText('Equipo o grupo'))).toEqual(['Todos', 'Norte', 'Sonido'])
    await userEvent.selectOptions(screen.getByLabelText('Dirección'), 'Dirección de Grupos de Vida')
    expect(etiquetasDe(screen.getByLabelText('Equipo o grupo'))).toEqual(['Todos', 'Norte'])
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'Jóvenes')
    expect(etiquetasDe(screen.getByLabelText('Equipo o grupo'))).toEqual(['Todos'])
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'Adultos')
    await userEvent.selectOptions(screen.getByLabelText('Equipo o grupo'), 'Norte')
    expect(nombresEnTabla()).toEqual(ordenEsperado('Pedro Ruiz', 'Ana Pérez'))
  })

  it('picking an Equipo o grupo sets its Área and Dirección', async () => {
    renderLideres()
    await userEvent.selectOptions(screen.getByLabelText('Equipo o grupo'), 'Sonido')
    expect(screen.getByLabelText('Dirección')).toHaveValue('d-exp')
    expect(screen.getByLabelText('Área')).toHaveValue('a-prod')
    expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez'))
  })

  it('choosing a Dirección clears Área and Equipo o grupo; choosing an Área clears Equipo o grupo', async () => {
    renderLideres()
    await userEvent.selectOptions(screen.getByLabelText('Equipo o grupo'), 'Norte')
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'Jóvenes')
    expect(screen.getByLabelText('Equipo o grupo')).toHaveValue('')
    expect(nombresEnTabla()).toEqual(ordenEsperado('Marta'))

    await userEvent.selectOptions(screen.getByLabelText('Área'), 'Adultos')
    await userEvent.selectOptions(screen.getByLabelText('Equipo o grupo'), 'Norte')
    await userEvent.selectOptions(screen.getByLabelText('Dirección'), 'Dirección de Experiencia')
    expect(screen.getByLabelText('Área')).toHaveValue('')
    expect(screen.getByLabelText('Equipo o grupo')).toHaveValue('')
    expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez', 'Ana Pérez'))
  })

  it('filters by Estado, including "Con agendados"', async () => {
    renderLideres()
    const selector = screen.getByLabelText('Estado')
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos',
      'Sin 1 a 1 en 30 días',
      'Al día',
      'Con agendados',
    ])
    await userEvent.selectOptions(selector, 'Con agendados')
    expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez', 'Ana Pérez'))
  })

  it('combines the filters (AND) and counts "Mostrando X de N"', async () => {
    renderLideres()
    expect(mostrando()).toHaveTextContent('Mostrando 4 de 4')
    await userEvent.selectOptions(screen.getByLabelText('Dirección'), 'Dirección de Grupos de Vida')
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Sin 1 a 1 en 30 días')
    expect(nombresEnTabla()).toEqual(ordenEsperado('Pedro Ruiz'))
    expect(mostrando()).toHaveTextContent('Mostrando 1 de 4')
    expect(within(listaLideres()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('"Limpiar filtros" appears with a filter and clears every filter', async () => {
    renderLideres()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Buscar'), 'ana')
    await userEvent.selectOptions(screen.getByLabelText('Equipo o grupo'), 'Norte')
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Al día')
    expect(mostrando()).toHaveTextContent('Mostrando 1 de 4')

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(mostrando()).toHaveTextContent('Mostrando 4 de 4')
    expect(screen.getByLabelText('Buscar')).toHaveValue('')
    expect(screen.getByLabelText('Dirección')).toHaveValue('')
    expect(screen.queryByLabelText('Área')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Equipo o grupo')).toHaveValue('')
    expect(screen.getByLabelText('Estado')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('says so when no leader matches the filters', async () => {
    renderLideres()
    await userEvent.type(screen.getByLabelText('Buscar'), 'nadie')
    expect(screen.getByText('Ningún líder coincide con estos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Líderes' })).not.toBeInTheDocument()
    expect(mostrando()).toHaveTextContent('Mostrando 0 de 4')
  })

  it('says so when the chain has no leaders, without counters or filters', () => {
    renderLideres([])
    expect(screen.getByText('No hay líderes en tu cadena de supervisión.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Líderes' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar')).not.toBeInTheDocument()
  })
})

describe('SupervisionUnoAUno — Líderes: table (S8.3)', () => {
  it('has the six columns and one row per leader with its data', () => {
    renderLideres([lider({ contextos: ['GDV: Norte', 'Dream Team: Sonido'] })])
    const encabezados = within(tablaLideres()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(encabezados).toEqual(['Líder', 'Qué lidera', 'Dirigidos', 'Realizados (30 días)', 'Agendados', 'Último 1 a 1'])
    const celdas = within(filasDe(tablaLideres())[0]).getAllByRole('cell').map((td) => td.textContent)
    expect(celdas).toEqual(['Ana Pérez', 'GDV: Norte, Dream Team: Sonido', '3', '2', '1', '20 oct 2026'])
  })

  it('keeps the "Sin 1 a 1 en 30 días" mark in the row and says "Nunca" without a last 1:1', () => {
    renderLideres([PEDRO, ANA])
    const [fila, otra] = filasDe(tablaLideres())
    expect(within(fila).getAllByRole('cell')[0]).toHaveTextContent('Pedro RuizSin 1 a 1 en 30 días')
    expect(within(fila).getAllByRole('cell')[5]).toHaveTextContent('Nunca')
    expect(within(otra).queryByText('Sin 1 a 1 en 30 días')).not.toBeInTheDocument()
  })

  it('keeps the database order by default, with no column marked as sorted', () => {
    renderLideres()
    expect(nombresEnTabla()).toEqual(ordenEsperado('Pedro Ruiz', 'José Álvarez', 'Ana Pérez', 'Marta'))
    expect(within(tablaLideres()).getAllByRole('columnheader').some((th) => th.hasAttribute('aria-sort'))).toBe(false)
  })

  it.each([
    ['líder', 'Líder', ['Ana Pérez', 'José Álvarez', 'Marta', 'Pedro Ruiz']],
    ['qué lidera', 'Qué lidera', ['Marta', 'José Álvarez', 'Pedro Ruiz', 'Ana Pérez']],
    ['dirigidos', 'Dirigidos', ['José Álvarez', 'Ana Pérez', 'Pedro Ruiz', 'Marta']],
    ['realizados (30 días)', 'Realizados (30 días)', ['Pedro Ruiz', 'José Álvarez', 'Ana Pérez', 'Marta']],
    ['agendados', 'Agendados', ['Pedro Ruiz', 'Marta', 'Ana Pérez', 'José Álvarez']],
    ['último 1 a 1', 'Último 1 a 1', ['Pedro Ruiz', 'José Álvarez', 'Ana Pérez', 'Marta']],
  ])('sorts by %s ascending, then descending', async (accesible, encabezado, ascendente) => {
    renderLideres()
    const boton = () => screen.getByRole('button', { name: `Ordenar por ${accesible}` })
    const th = () => boton().closest('th')

    await userEvent.click(boton())
    expect(nombresEnTabla()).toEqual(ordenEsperado(...ascendente))
    expect(th()).toHaveAttribute('aria-sort', 'ascending')

    await userEvent.click(boton())
    expect(th()).toHaveAttribute('aria-sort', 'descending')
    if (encabezado === 'Realizados (30 días)') {
      // Ties keep the database order.
      expect(nombresEnTabla()).toEqual(ordenEsperado('Marta', 'Ana Pérez', 'Pedro Ruiz', 'José Álvarez'))
    } else if (encabezado === 'Agendados') {
      expect(nombresEnTabla()).toEqual(ordenEsperado('José Álvarez', 'Ana Pérez', 'Pedro Ruiz', 'Marta'))
    } else {
      expect(nombresEnTabla()).toEqual(ordenEsperado(...[...ascendente].reverse()))
    }
  })

  it('sorts the filtered rows and the phone list in the same order', async () => {
    renderLideres()
    await userEvent.selectOptions(screen.getByLabelText('Dirección'), 'Dirección de Grupos de Vida')
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por dirigidos' }))
    expect(nombresEnTabla()).toEqual(ordenEsperado('Ana Pérez', 'Pedro Ruiz', 'Marta'))
    expect(within(listaLideres()).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'Ana Pérez',
      'Pedro Ruiz',
      'Marta',
    ])
  })
})

describe('SupervisionUnoAUno — Líderes: phone (S8.4)', () => {
  it('lists one compact row per leader with the same data', () => {
    renderLideres([PEDRO, lider({ contextos: ['GDV: Norte', 'Dream Team: Sonido'] })])
    const lista = within(listaLideres())
    expect(lista.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Pedro Ruiz', 'Ana Pérez'])
    const pedro = within(lista.getByRole('listitem', { name: 'Pedro Ruiz' }))
    expect(pedro.getByText('Sin 1 a 1 en 30 días')).toBeInTheDocument()
    expect(pedro.getByText('Dirigidos 5 · Realizados 0 · Agendados 0 · Último: Nunca')).toBeInTheDocument()
    const anaFila = within(lista.getByRole('listitem', { name: 'Ana Pérez' }))
    expect(anaFila.getByText('GDV: Norte, Dream Team: Sonido')).toBeInTheDocument()
    expect(anaFila.getByText('Dirigidos 3 · Realizados 2 · Agendados 1 · Último: 20 oct 2026')).toBeInTheDocument()
    expect(anaFila.queryByText('Sin 1 a 1 en 30 días')).not.toBeInTheDocument()
  })

  it('keeps Dirección, Área, Equipo o grupo and Estado in a sheet that filters live, "Limpiar" and "Ver N"', async () => {
    renderLideres()
    const botonFiltros = () => screen.getByRole('button', { name: /^Filtros/ })
    expect(botonFiltros()).toHaveTextContent(/^Filtros$/)

    await userEvent.click(botonFiltros())
    const hoja = within(screen.getByRole('dialog', { name: 'Filtros' }))
    await userEvent.selectOptions(hoja.getByLabelText('Dirección'), 'Dirección de Experiencia')
    await userEvent.selectOptions(hoja.getByLabelText('Estado'), 'Con agendados')
    expect(hoja.getByRole('button', { name: 'Ver 2' })).toBeInTheDocument()
    await userEvent.selectOptions(hoja.getByLabelText('Área'), 'Producción')
    expect(hoja.getByRole('button', { name: 'Ver 1' })).toBeInTheDocument()

    await userEvent.click(hoja.getByRole('button', { name: 'Limpiar' }))
    expect(hoja.getByRole('button', { name: 'Ver 4' })).toBeInTheDocument()
    expect(hoja.getByLabelText('Dirección')).toHaveValue('')
    expect(hoja.queryByLabelText('Área')).not.toBeInTheDocument()
    await userEvent.selectOptions(hoja.getByLabelText('Equipo o grupo'), 'Sonido')
    await userEvent.click(hoja.getByRole('button', { name: 'Ver 1' }))

    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
    // The equipo also set its área and its dirección.
    expect(botonFiltros()).toHaveTextContent('Filtros · 3')
    expect(within(listaLideres()).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'José Álvarez',
    ])
  })
})

describe('SupervisionUnoAUno — 1 a 1 recientes (S8.5, S7.2)', () => {
  const RECIENTES = [
    supervisado({ id: 's-1', lugar: 'Café Centro', resumen: 'Hablamos de su familia.', celebracion: 'Se bautizó' }),
    supervisado({ id: 's-2', estado: 'agendado', dirigidos: [{ id: 'd-3', nombre: 'Íñigo', apellido: 'Núñez' }] }),
    supervisado({ id: 's-3', estado: 'cancelado', motivoCancelacion: 'Viaje', lideres: [{ id: 'l-2', nombre: 'Pedro', apellido: 'Ruiz' }] }),
  ]
  const tablaRecientes = () => screen.getByRole('table', { name: '1 a 1 recientes' })
  const titulosEnTabla = () => filasDe(tablaRecientes()).map((fila) => within(fila).getAllByRole('cell')[0].textContent)

  async function renderRecientes(recientes: readonly UnoAUnoSupervisado[] = RECIENTES): Promise<void> {
    render(<SupervisionUnoAUno lideres={LIDERES} recientes={recientes} />)
    await abrirRecientes()
  }

  it('shows who with whom, date, estado, place, resumen and celebración in the table', async () => {
    await renderRecientes()
    const encabezados = within(tablaRecientes()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(encabezados).toEqual(['1 a 1', 'Fecha', 'Estado', 'Lugar', 'Detalle'])
    const fila = within(filasDe(tablaRecientes())[0])
    expect(fila.getByText('Ana Pérez → Luis Gómez y María Gómez')).toBeInTheDocument()
    expect(fila.getByText('martes 20 de octubre de 2026, 15:30')).toBeInTheDocument()
    expect(fila.getByText('Realizado')).toBeInTheDocument()
    expect(fila.getByText('Café Centro')).toBeInTheDocument()
    expect(fila.getByText('Hablamos de su familia.')).toBeInTheDocument()
    expect(fila.getByText('Se bautizó')).toBeInTheDocument()
  })

  it('shows the motivo of a cancelled 1:1 and the estado of a scheduled one', async () => {
    await renderRecientes()
    const [, agendado, cancelado] = filasDe(tablaRecientes())
    expect(within(agendado).getByText('Agendado')).toBeInTheDocument()
    expect(within(cancelado).getByText('Cancelado')).toBeInTheDocument()
    expect(within(cancelado).getByText('Motivo: Viaje')).toBeInTheDocument()
  })

  it('lists the same 1:1s on phones', async () => {
    await renderRecientes()
    const lista = within(screen.getByRole('list', { name: '1 a 1 recientes en lista' }))
    expect(lista.getAllByRole('listitem')).toHaveLength(3)
    const primero = within(lista.getAllByRole('listitem')[0])
    expect(primero.getByText('Ana Pérez → Luis Gómez y María Gómez')).toBeInTheDocument()
    expect(primero.getByText('Café Centro')).toBeInTheDocument()
    expect(primero.getByText('Se bautizó')).toBeInTheDocument()
  })

  it('filters by estado and counts "Mostrando X de N"', async () => {
    await renderRecientes()
    expect(mostrando()).toHaveTextContent('Mostrando 3 de 3')
    const selector = screen.getByLabelText('Estado')
    expect(within(selector).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todos',
      'Agendado',
      'Realizado',
      'Cancelado',
    ])
    await userEvent.selectOptions(selector, 'Cancelado')
    expect(titulosEnTabla()).toEqual(['Pedro Ruiz → Luis Gómez y María Gómez'])
    expect(mostrando()).toHaveTextContent('Mostrando 1 de 3')
  })

  it('searches the leaders and dirigidos ignoring accents, combined with the estado', async () => {
    await renderRecientes()
    await userEvent.type(screen.getByLabelText('Buscar'), 'inigo nunez')
    expect(titulosEnTabla()).toEqual(['Ana Pérez → Íñigo Núñez'])
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Realizado')
    expect(screen.getByText('Ningún 1 a 1 coincide con estos filtros.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '1 a 1 recientes' })).not.toBeInTheDocument()
  })

  it('is read-only and never shows a private note', async () => {
    const conNota = { ...supervisado({ resumen: 'Bien' }), notaPrivada: 'Secreto pastoral' } as UnoAUnoSupervisado
    render(<SupervisionUnoAUno lideres={[lider({})]} recientes={[conNota]} />)
    await abrirRecientes()
    expect(screen.getAllByText('Bien')).toHaveLength(2)
    expect(screen.queryByText('Secreto pastoral')).not.toBeInTheDocument()
    expect(screen.queryByText(/nota privada/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar|registrar|cancelar|reprogramar/i })).not.toBeInTheDocument()
  })

  it('says so when there are no recent 1:1s', async () => {
    await renderRecientes([])
    expect(screen.getByText('No hay 1 a 1 en los últimos 90 días.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar')).not.toBeInTheDocument()
  })
})
