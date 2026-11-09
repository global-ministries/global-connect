/**
 * `<MatrizClient>` — Matriz de domingos (odd/tasks/dps-asistencia-pco.md, T12;
 * artboard docs/design-system/prototipos/planificacion-dps/03-matriz-domingos.html,
 * docs/design-system/patterns.md#matrix-assign). The server actions are
 * mocked: the header (range, ‹ Hoy ›, summary), the series bands and date
 * heads, the frozen first column and sticky heads (colgroup + table-fixed,
 * never `relative` after `sticky`), the cells with «Falta», the popover that
 * convoca and quita and stays open, the rollback, the automatic directors
 * (S8: «Automático», never removable), the highlight, Condensado / Normal,
 * the team filter, the keyboard, the read-only matrix and the phone
 * message. Every person is fictitious.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MatrizClient, type MatrizClientProps } from '@/components/dps/matriz-client'
import * as acciones from '@/lib/actions/dps-plan.actions'
import { rangoMatriz } from '@/lib/platform/dps/matriz'
import { leerCandidatos, leerEquiposPlan, leerPlanCabecera, type PlanCabecera } from '@/lib/platform/dps/plan'

jest.mock('@/lib/actions/dps-plan.actions', () => ({
  buscarCandidatosDps: jest.fn(),
  convocarDps: jest.fn(),
  desconvocarDps: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dps/matriz',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const buscar = mock(acciones.buscarCandidatosDps)
const convocar = mock(acciones.convocarDps)
const desconvocar = mock(acciones.desconvocarDps)

beforeAll(() => {
  // Radix popper measures its anchor; jsdom has no ResizeObserver.
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const SERIE_A = { id: 'sa', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4 }
const SERIE_B = { id: 'sb', nombre: 'Pecadores como yo', color: 'chart-3', imagen_path: null, semanas: 3 }
const plan = (id: string, fecha: string, parche: Record<string, unknown> = {}): PlanCabecera =>
  leerPlanCabecera({ id, fecha, tipo: 'domingo', titulo: null, semana: 1, serie: SERIE_A, horarios: ['09:15', '11:15'], llegada: '07:00', ...parche })!

const PLANES = [
  plan('p1', '2026-11-01', { semana: 2 }),
  plan('p8', '2026-11-08', { semana: 3 }),
  plan('cena', '2026-11-10', { tipo: 'cena_del_senor', serie: null, semana: null, horarios: ['18:45'] }),
  plan('p15', '2026-11-15', { serie: SERIE_B, semana: 1 }),
]

const conv = (id: string, nombre: string, automatico = false) => ({ convocado_id: `c-${id}`, persona_id: id, servicio_id: `sv-${id}`, nombre, automatico })
const equiposJson = (planId: string, puedeEditar: boolean, monitores: unknown[], pantallas: unknown[] = []) => ({
  plan_id: planId,
  puede_editar: puedeEditar,
  equipos: [
    {
      equipo_id: 'dps',
      equipo: 'DPS',
      ruta: 'a',
      puestos: [{ puesto_id: 'dmedia', nombre: 'Director de Media', cantidad: 1, activo: true, convocados: [conv('dm', 'Delia Mora', true)] }],
    },
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'b',
      puestos: [{ puesto_id: 'mon', nombre: 'Monitores', cantidad: 2, activo: true, convocados: monitores }],
    },
    { equipo_id: 'video', equipo: 'Video', ruta: 'c', puestos: [{ puesto_id: 'pant', nombre: 'Pantallas', cantidad: 1, activo: true, convocados: pantallas }] },
  ],
})

const equipos = (puedeEditar = true) => ({
  p1: leerEquiposPlan(equiposJson('p1', puedeEditar, [conv('li', 'Lorena Ibarra'), conv('wd', 'Wilmer Duque')], [conv('ca', 'Carmen Aular')])),
  p8: leerEquiposPlan(equiposJson('p8', puedeEditar, [conv('li', 'Lorena Ibarra')])),
  cena: leerEquiposPlan(equiposJson('cena', puedeEditar, [])),
  p15: leerEquiposPlan(equiposJson('p15', puedeEditar, [conv('wd', 'Wilmer Duque')], [conv('li', 'Lorena Ibarra')])),
})

const props = (parche: Partial<MatrizClientProps> = {}): MatrizClientProps => ({
  rango: rangoMatriz('2026-11-01'),
  hoy: '2026-11-07',
  planes: PLANES,
  equipos: equipos(),
  editable: true,
  error: null,
  ...parche,
})

const candidatos = leerCandidatos([
  {
    servicio_id: 'sv-cs',
    persona_id: 'cs',
    nombre: 'Camila',
    apellido: 'Rojas',
    equipo: 'Audio',
    rol: 'Servidor',
    ya_convocado_en_plan: true,
    puestos_del_dia: [{ plan_id: 'p8', mismo_plan: true, puesto_id: 'foh', puesto: 'Audio FOH', equipo: 'Audio' }],
  },
  { servicio_id: 'sv-is', persona_id: 'is', nombre: 'Irene', apellido: 'Saavedra', equipo: 'Audio', rol: 'Servidor', puestos_del_dia: [] },
])

const grid = () => screen.getByRole('grid', { name: 'Convocados por puesto y fecha' })
const celda = (puesto: string, columna: string) => grid().querySelector<HTMLElement>(`td[data-puesto="${puesto}"][data-columna="${columna}"]`)!
const estado = () => screen.getByTestId('estado-guardado')

beforeEach(() => {
  jest.clearAllMocks()
  buscar.mockResolvedValue({ ok: true, data: candidatos })
  convocar.mockResolvedValue({ ok: true, data: { convocadoId: 'c-nuevo' } })
  desconvocar.mockResolvedValue({ ok: true, data: { quitado: true } })
})

describe('the header', () => {
  it('has the crumbs, the title, the range summary and the 8-week navigation', async () => {
    render(<MatrizClient {...props()} />)
    expect(await screen.findByRole('navigation', { name: 'Ubicación' })).toHaveTextContent(/^DPS›Plan›Matriz$/)
    expect(screen.getByRole('heading', { level: 1, name: 'Matriz de domingos' })).toBeInTheDocument()
    // p1: Monitores 0 + Pantallas 0; p8: 1 + 1; cena: 2 + 1; p15: 1 + 0; director puestos all filled.
    expect(screen.getByTestId('resumen-matriz')).toHaveTextContent('1 nov – 20 dic 2026 · 8 domingos y 1 día especial · 6 puestos sin cubrir')
    expect(screen.getByRole('link', { name: 'Semanas anteriores' })).toHaveAttribute('href', '/dps/matriz?desde=2026-09-06')
    expect(screen.getByRole('link', { name: 'Hoy' })).toHaveAttribute('href', '/dps/matriz')
    expect(screen.getByRole('link', { name: 'Semanas siguientes' })).toHaveAttribute('href', '/dps/matriz?desde=2026-12-27')
  })

  it('tells phones to use a wider screen and links to the plan', () => {
    render(<MatrizClient {...props()} />)
    const movil = screen.getByTestId('matriz-movil')
    expect(movil).toHaveClass('md:hidden')
    expect(movil).toHaveTextContent('La matriz se usa en una pantalla más ancha')
    expect(within(movil).getByRole('link', { name: 'Ir al plan del domingo' })).toHaveAttribute('href', '/dps/plan')
    // The matrix region, its toolbar and keys are desktop only; the frame fills the viewport from md.
    expect(screen.getByRole('region', { name: 'Matriz de domingos' })).toHaveClass('hidden', 'md:block', 'overflow-auto', 'flex-1', 'min-h-0')
    expect(screen.getByTestId('marco-matriz')).toHaveClass('md:h-[calc(100dvh-4rem)]', 'md:flex', 'md:flex-col')
  })
})

describe('the grid', () => {
  it('has the series bands, the date heads linking to each plan and «Próximo»', () => {
    render(<MatrizClient {...props()} />)
    const bandas = within(grid()).getAllByTestId('banda')
    expect(bandas.map((b) => [b.textContent, b.getAttribute('colspan')])).toEqual([
      ['Tu casa tiene influencers4 semanas', '2'],
      ['Especial', '1'],
      ['Pecadores como yo3 semanas', '1'],
      ['Sin serie', '5'],
    ])
    expect(within(grid()).getByRole('link', { name: 'dom 8 nov' })).toHaveAttribute('href', '/dps/plan?plan=p8')
    expect(within(grid()).getByRole('link', { name: 'Cena del Señor' })).toHaveAttribute('href', '/dps/plan?plan=cena')
    expect(within(grid()).getByText('mar 10 nov · 18:45')).toBeInTheDocument()
    expect(within(grid()).getByText('Próximo').closest('th')).toHaveTextContent('dom 8 nov')
    // A Sunday without a plan has no link.
    expect(within(grid()).getByText('dom 22 nov').closest('a')).toBeNull()
  })

  it('freezes the first column and the heads with one fixed width per column (S9.6 lessons)', () => {
    render(<MatrizClient {...props()} />)
    const tabla = grid()
    expect(tabla).toHaveClass('table-fixed')
    const cols = tabla.querySelectorAll('colgroup col')
    // Puesto + 8 Sundays + 1 special day.
    expect(cols).toHaveLength(10)
    expect((cols[0] as HTMLElement).style.width).toBe('190px')
    const sumaCols = Array.from(cols).reduce((n, c) => n + parseInt((c as HTMLElement).style.width, 10), 0)
    expect(tabla.style.width).toBe(`${sumaCols}px`)
    const esquina = within(tabla).getByRole('columnheader', { name: 'Equipo › puesto' })
    expect(esquina).toHaveClass('sticky', 'left-0', 'top-0')
    const cabezaPuesto = within(tabla).getByRole('rowheader', { name: 'Monitores' })
    expect(cabezaPuesto).toHaveClass('sticky', 'left-0')
    expect(cabezaPuesto).not.toHaveClass('relative')
    for (const banda of within(tabla).getAllByTestId('banda')) expect(banda).toHaveClass('sticky', 'top-0')
    expect(within(tabla).getByRole('link', { name: 'dom 8 nov' }).closest('th')).toHaveClass('sticky', 'top-[30px]')
  })

  it('lists the convocados of each puesto and date, with «Falta» and the team sums', () => {
    render(<MatrizClient {...props()} />)
    expect(celda('mon', 'p1')).toHaveTextContent('Lorena IbarraWilmer Duque')
    expect(celda('mon', 'p8')).toHaveTextContent('Lorena Ibarra1Falta')
    expect(celda('mon', 'cena')).toHaveTextContent('2Falta')
    expect(celda('mon', 'domingo-2026-11-22')).toHaveTextContent('—')
    expect(within(grid()).getByRole('rowheader', { name: /^Audio/ })).toHaveTextContent('Audio4 faltan')
    expect(within(grid()).getByRole('rowheader', { name: /^DPS/ })).toHaveTextContent('DPScompleto')
    // Names wrap instead of being cut.
    expect(within(celda('mon', 'p1')).getByText('Lorena Ibarra')).not.toHaveClass('truncate')
  })
})

describe('convocar and quitar', () => {
  it('opens the popover on a cell, convoca at once and keeps it open on the updated cell', async () => {
    const usuario = userEvent.setup()
    let terminar!: (r: Awaited<ReturnType<typeof acciones.convocarDps>>) => void
    convocar.mockReturnValueOnce(new Promise((r) => (terminar = r)))
    render(<MatrizClient {...props()} />)

    await usuario.click(celda('mon', 'p8'))
    const dialogo = await screen.findByRole('dialog', { name: 'Monitores · dom 8 nov' })
    expect(celda('mon', 'p8')).toHaveAttribute('aria-selected', 'true')
    expect(dialogo).toHaveTextContent('Audio · 1 de 2 · 9:15 y 11:15')
    expect(buscar).toHaveBeenCalledWith({ planId: 'p8', puestoId: 'mon', busqueda: '' })
    const opciones = await within(dialogo).findAllByRole('button', { name: /Rojas|Saavedra/ })
    // The conflict warning of the plan popover.
    expect(opciones.find((b) => b.textContent?.includes('Camila Rojas'))).toHaveTextContent('Ya sirve ese día en Audio FOH')

    await usuario.click(within(dialogo).getByRole('button', { name: /Irene Saavedra/ }))
    expect(convocar).toHaveBeenCalledWith({ planId: 'p8', puestoId: 'mon', servicioId: 'sv-is' })
    expect(celda('mon', 'p8')).toHaveTextContent('Irene SaavedraLorena Ibarra')
    expect(celda('mon', 'p8')).not.toHaveTextContent('Falta')
    expect(estado()).toHaveTextContent('Guardando…')
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Convocaste a Irene Saavedra · Monitores, dom 8 nov.')
    expect(screen.getByRole('dialog', { name: 'Monitores · dom 8 nov' })).toHaveTextContent('Audio · 2 de 2')

    terminar({ ok: true, data: { convocadoId: 'c-nuevo' } })
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'))
    // The candidates are read again, now with the new person in the puesto.
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2))
  })

  it('rolls back and explains a refused convocatoria', async () => {
    const usuario = userEvent.setup()
    convocar.mockResolvedValueOnce({ ok: false, message: 'Esa persona ya no sirve en este equipo. Busca de nuevo.', codigo: 'servicio_invalido' })
    render(<MatrizClient {...props()} />)
    await usuario.click(celda('pant', 'p8'))
    const dialogo = await screen.findByRole('dialog', { name: 'Pantallas · dom 8 nov' })
    await usuario.click(await within(dialogo).findByRole('button', { name: /Irene Saavedra/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esa persona ya no sirve en este equipo. Busca de nuevo.'))
    expect(celda('pant', 'p8')).not.toHaveTextContent('Irene Saavedra')
    expect(celda('pant', 'p8')).toHaveTextContent('1Falta')
    expect(estado()).toHaveTextContent('No se pudo guardar')
  })

  it('quita from the popover and puts the person back when it fails', async () => {
    const usuario = userEvent.setup()
    desconvocar.mockResolvedValueOnce({ ok: false, message: 'Solo quienes arman el plan pueden cambiar los convocados.', codigo: 'sin_autoridad' })
    render(<MatrizClient {...props()} />)
    await usuario.click(celda('mon', 'p1'))
    let dialogo = await screen.findByRole('dialog', { name: 'Monitores · dom 1 nov' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Quitar a Wilmer Duque' }))
    expect(desconvocar).toHaveBeenCalledWith({ planId: 'p1', puestoId: 'mon', personaId: 'wd' })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Solo quienes arman el plan pueden cambiar los convocados.'))
    expect(celda('mon', 'p1')).toHaveTextContent('Wilmer Duque')

    dialogo = screen.getByRole('dialog', { name: 'Monitores · dom 1 nov' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Quitar a Wilmer Duque' }))
    expect(celda('mon', 'p1')).not.toHaveTextContent('Wilmer Duque')
    expect(celda('mon', 'p1')).toHaveTextContent('1Falta')
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Quitaste a Wilmer Duque · Monitores, dom 1 nov.')
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'))
  })

  it('shows the automatic director as «Automático» and never offers to remove them (S8)', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    expect(celda('dmedia', 'p8')).toHaveTextContent('Delia Mora')
    await usuario.click(celda('dmedia', 'p8'))
    const dialogo = await screen.findByRole('dialog', { name: 'Director de Media · dom 8 nov' })
    expect(within(dialogo).getByText('Automático')).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: /Quitar a Delia Mora/ })).not.toBeInTheDocument()
    // Someone else may still be convocado by hand.
    expect(within(dialogo).getByRole('searchbox', { name: 'Buscar en el equipo' })).toBeInTheDocument()
  })

  it('closes with Escape and returns focus to the cell', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    await usuario.click(celda('mon', 'p8'))
    await screen.findByRole('dialog', { name: 'Monitores · dom 8 nov' })
    await usuario.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(celda('mon', 'p8')).toHaveFocus()
    expect(celda('mon', 'p8')).not.toHaveAttribute('aria-selected')
  })

  it('announces a cell that does not apply instead of opening', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    await usuario.click(celda('mon', 'domingo-2026-11-22'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('El domingo 22 de noviembre no tiene plan todavía.')
  })
})

describe('highlight, density and filter', () => {
  it('highlights a person in every date from the popover and clears it from the toolbar', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    await usuario.click(celda('mon', 'p1'))
    const dialogo = await screen.findByRole('dialog', { name: 'Monitores · dom 1 nov' })
    const resaltar = within(dialogo).getByRole('button', { name: 'Resaltar a Lorena Ibarra en la matriz' })
    await usuario.click(resaltar)
    expect(resaltar).toHaveAttribute('aria-pressed', 'true')
    const chip = screen.getByTestId('resaltado')
    expect(chip).toHaveTextContent('Resaltado: Lorena Ibarra · 3 de 8 domingos')
    expect(within(celda('pant', 'p15')).getByText('Lorena Ibarra')).toHaveAttribute('data-resaltado', 'true')
    expect(within(celda('mon', 'p1')).getByText('Wilmer Duque')).not.toHaveAttribute('data-resaltado')

    await usuario.keyboard('{Escape}')
    await usuario.click(within(chip).getByRole('button', { name: 'Quitar resaltado de Lorena Ibarra' }))
    expect(screen.queryByTestId('resaltado')).not.toBeInTheDocument()
    expect(within(celda('pant', 'p15')).getByText('Lorena Ibarra')).not.toHaveAttribute('data-resaltado')
  })

  it('switches to Condensado with short names', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Condensado' }))
    expect(screen.getByRole('button', { name: 'Condensado' })).toHaveAttribute('aria-pressed', 'true')
    expect(celda('mon', 'p1')).toHaveTextContent('Lorena I.Wilmer D.')
    expect(grid()).toHaveAttribute('data-densidad', 'condensado')
  })

  it('filters by team', async () => {
    render(<MatrizClient {...props()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Equipo' }), { target: { value: 'video' } })
    expect(within(grid()).queryByRole('rowheader', { name: 'Monitores' })).not.toBeInTheDocument()
    expect(within(grid()).getByRole('rowheader', { name: 'Pantallas' })).toBeInTheDocument()
  })
})

describe('the keyboard', () => {
  it('moves with the arrows over one roving cell and opens with Enter', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props()} />)
    const primera = celda('dmedia', 'p1')
    expect(primera).toHaveAttribute('tabindex', '0')
    expect(grid().querySelectorAll('td[tabindex="0"]')).toHaveLength(1)
    primera.focus()
    await usuario.keyboard('{ArrowDown}')
    expect(celda('mon', 'p1')).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(celda('mon', 'p8')).toHaveFocus()
    await usuario.keyboard('{End}')
    expect(celda('mon', 'domingo-2026-12-20')).toHaveFocus()
    await usuario.keyboard('{Home}')
    expect(celda('mon', 'p1')).toHaveFocus()
    expect(celda('mon', 'p1')).toHaveAttribute('tabindex', '0')
    await usuario.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: 'Monitores · dom 1 nov' })).toBeInTheDocument()
  })
})

describe('read-only', () => {
  it('shows the same matrix without convocar nor quitar, but keeps the highlight', async () => {
    const usuario = userEvent.setup()
    render(<MatrizClient {...props({ equipos: equipos(false), editable: false })} />)
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument()
    expect(screen.queryByTestId('estado-guardado')).not.toBeInTheDocument()
    expect(grid()).toHaveAttribute('aria-readonly', 'true')
    await usuario.click(celda('mon', 'p1'))
    const dialogo = await screen.findByRole('dialog', { name: 'Monitores · dom 1 nov' })
    expect(within(dialogo).queryByRole('button', { name: /Quitar a/ })).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('searchbox')).not.toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Resaltar a Lorena Ibarra en la matriz' })).toBeInTheDocument()
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('empty and error states', () => {
  it('says when a range could not be read and keeps the navigation', () => {
    render(<MatrizClient {...props({ planes: [], equipos: {}, editable: false, error: 'No se pudo cargar el plan. Actualiza la página.' })} />)
    expect(screen.getByText('No se pudo cargar el plan. Actualiza la página.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Semanas siguientes' })).toBeInTheDocument()
  })

  it('says when the range has no plans yet', () => {
    render(<MatrizClient {...props({ planes: [], equipos: {}, editable: false })} />)
    expect(screen.getByText('Sin planes en estas semanas')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('keeps the matrix and warns when some dates could not be read', () => {
    const { cena: _cena, ...resto } = equipos()
    render(<MatrizClient {...props({ equipos: resto, error: 'No se pudo cargar 1 fecha. Actualiza la página.' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar 1 fecha. Actualiza la página.')
    expect(celda('mon', 'cena')).toHaveTextContent('—')
  })
})
