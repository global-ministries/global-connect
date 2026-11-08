/**
 * `<ProgramacionClient>` — the annual programming sheet
 * (odd/tasks/dps-asistencia-pco.md, T11; S6.4, S7.1, S7.3; artboard
 * docs/design-system/prototipos/planificacion-dps/04-programacion-anual-hoja.html).
 * The server actions are mocked: the header and summary, month separators,
 * Sunday and special rows, the date link to the plan, inline editing with
 * Enter / Tab / Esc / typing over a cell / Delete, the rollback with its
 * message, the first edit of a Sunday without a plan, the read-only sheet
 * of a plain servidor (S6), the month filter, the column picker, the
 * density, the year selector and "Nueva serie". Every name is fictitious.
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProgramacionClient, type ProgramacionClientProps } from '@/components/dps/programacion-client'
import * as acciones from '@/lib/actions/dps-programacion.actions'
import * as accionesPlan from '@/lib/actions/dps-plan.actions'
import { leerPlanHoja, leerPlanesHoja, type PlanHoja } from '@/lib/platform/dps/programacion'

jest.mock('@/lib/actions/dps-programacion.actions', () => ({
  cargarProgramacionDps: jest.fn(),
  guardarCeldaDps: jest.fn(),
  crearSerieDps: jest.fn(),
}))
jest.mock('@/lib/actions/dps-plan.actions', () => ({ cambiarPortadaDps: jest.fn() }))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push }),
  usePathname: () => '/dps/programacion',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const cargar = mock(acciones.cargarProgramacionDps)
const guardar = mock(acciones.guardarCeldaDps)
const crearSerie = mock(acciones.crearSerieDps)
const cambiarPortada = mock(accionesPlan.cambiarPortadaDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4, primer_domingo: '2026-10-25' }
const json = (id: string, fecha: string, parche: Record<string, unknown> = {}) => ({
  id,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  productor: null,
  host: null,
  comunicador: null,
  campos: {},
  ...parche,
})
const PLANES = [
  json('p1', '2026-11-01', { serie: SERIE, semana: 2, productor: { persona_id: null, texto: 'Ximena Rangel', nombre: 'Ximena Rangel' }, campos: { opener: 'Video: sala llena' } }),
  json('cena', '2026-11-03', { tipo: 'cena_del_senor', horarios: ['18:45'] }),
  json('p8', '2026-11-08', { serie: SERIE, semana: 3, host: { persona_id: 'u1', texto: null, nombre: 'Andrés Valero' } }),
  json('p15', '2026-11-15', { serie: SERIE, semana: 4 }),
]

const props = (parche: Partial<ProgramacionClientProps> = {}): ProgramacionClientProps => ({
  anio: 2026,
  hoy: '2026-11-04',
  planes: leerPlanesHoja(PLANES),
  editable: true,
  error: null,
  ...parche,
})

const celda = (fecha: string, columna: string): HTMLElement => {
  const td = document.querySelector<HTMLElement>(`[data-fecha="${fecha}"][data-columna="${columna}"]`)
  if (!td) throw new Error(`sin celda ${fecha} ${columna}`)
  return td
}
const guardado = (plan: Record<string, unknown>): ReturnType<typeof acciones.guardarCeldaDps> => Promise.resolve({ ok: true, data: leerPlanHoja(plan) as PlanHoja })

beforeEach(() => {
  jest.clearAllMocks()
})

describe('the sheet', () => {
  it('shows the header, the summary, month separators, the Serie column and the date link to the plan', () => {
    render(<ProgramacionClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Programación 2026' })).toBeInTheDocument()
    // 52 Sundays · 1 series · 1 special day; from 4 Nov: 8, 15, 22, 29 Nov + 5 Dec Sundays → (3+2+3+3+3×4)=…
    expect(screen.getByTestId('resumen-programacion')).toHaveTextContent(/52 domingos · 1 serie · 1 día especial · \d+ puestos de productor, host o comunicador sin asignar de aquí a fin de año/)
    const hoja = screen.getByRole('grid', { name: /Programación 2026/ })
    expect(within(hoja).getByRole('rowheader', { name: /noviembre 2026/i })).toHaveTextContent('5 domingos')
    expect(within(hoja).getByRole('link', { name: /dom 8 nov/ })).toHaveAttribute('href', '/dps/plan?plan=p8')
    expect(within(hoja).getAllByText('Tu casa tiene influencers')).toHaveLength(3)
    expect(within(hoja).getByText('3/4')).toBeInTheDocument()
    expect(celda('2026-11-01', 'productor')).toHaveTextContent('Ximena Rangel')
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero')
    expect(within(hoja).getByText('Próximo')).toBeInTheDocument()
  })

  it('shows a special day as a hatched row that is not edited', () => {
    render(<ProgramacionClient {...props()} />)
    const fila = within(screen.getByRole('grid')).getByText('Cena del Señor').closest('tr')!
    expect(fila).toHaveTextContent('Especial')
    expect(fila).toHaveTextContent('18:45')
    expect(within(fila).queryAllByRole('gridcell')).toHaveLength(0)
    expect(within(fila).getByRole('link', { name: /mar 3 nov/ })).toHaveAttribute('href', '/dps/plan?plan=cena')
  })
})

describe('editing a cell', () => {
  it('Enter edits with the named input, Enter saves and moves down', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { serie: SERIE, semana: 4, campos: { opener: 'Drama corto' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const td = celda('2026-11-15', 'opener')
    act(() => td.focus())
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Opener, 15 de noviembre' })
    await user.type(input, 'Drama corto')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'opener', valor: 'Drama corto' })
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
    expect(celda('2026-11-15', 'opener')).toHaveTextContent('Drama corto')
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Opener del 15 de noviembre: Drama corto.')
    expect(celda('2026-11-22', 'opener')).toHaveFocus()
  })

  it('Tab saves and moves right; Shift+Tab moves left', async () => {
    guardar.mockReturnValue(guardado(json('p8', '2026-11-08', { comunicador: { persona_id: null, texto: 'Ps. Olmedo', nombre: 'Ps. Olmedo' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-08', 'comunicador').focus())
    await user.keyboard('{Enter}')
    await user.type(screen.getByRole('textbox', { name: 'Comunicador, 8 de noviembre' }), 'Ps. Olmedo')
    await user.keyboard('{Tab}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p8', fecha: '2026-11-08', columna: 'comunicador', valor: 'Ps. Olmedo' })
    expect(celda('2026-11-08', 'opener')).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(celda('2026-11-08', 'comunicador')).toHaveFocus()
  })

  it('Esc cancels and keeps the old value', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-01', 'opener').focus())
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Opener, 1 de noviembre' })
    await user.clear(input)
    await user.type(input, 'Otro')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(celda('2026-11-01', 'opener')).toHaveTextContent('Video: sala llena')
    expect(celda('2026-11-01', 'opener')).toHaveFocus()
    expect(guardar).not.toHaveBeenCalled()
  })

  it('typing over a cell replaces it; arrows move; Delete clears and saves', async () => {
    guardar.mockImplementation(async (input) => ({ ok: true, data: leerPlanHoja(json(input.planId!, input.fecha, { campos: input.valor ? { notas: input.valor } : {} }))! }))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-01', 'opener').focus())
    await user.keyboard('{ArrowDown}{ArrowRight}')
    expect(celda('2026-11-08', 'anuncios')).toHaveFocus()
    await user.keyboard('B')
    const input = screen.getByRole('textbox', { name: 'Anuncios, 8 de noviembre' })
    expect(input).toHaveValue('B')
    await user.type(input, 'autizos')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenLastCalledWith({ planId: 'p8', fecha: '2026-11-08', columna: 'anuncios', valor: 'Bautizos' })
    act(() => celda('2026-11-01', 'productor').focus())
    await user.keyboard('{Delete}')
    expect(guardar).toHaveBeenLastCalledWith({ planId: 'p1', fecha: '2026-11-01', columna: 'productor', valor: '' })
  })

  it('rolls back and explains when the save fails', async () => {
    guardar.mockResolvedValue({ ok: false, message: 'Solo quienes arman el plan pueden cambiar la programación.', codigo: 'sin_autoridad' })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-01', 'opener').focus())
    await user.keyboard('X{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Solo quienes arman el plan pueden cambiar la programación.'))
    expect(celda('2026-11-01', 'opener')).toHaveTextContent('Video: sala llena')
    expect(screen.getByTestId('estado-guardado')).toHaveTextContent('No se pudo guardar')
  })

  it('does not save an unchanged cell nor a value the RPC would refuse', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-01', 'opener').focus())
    await user.keyboard('{Enter}{Enter}')
    expect(guardar).not.toHaveBeenCalled()
    act(() => celda('2026-11-08', 'host').focus())
    await user.keyboard('{Enter}')
    fireEvent.change(screen.getByRole('textbox', { name: 'Host, 8 de noviembre' }), { target: { value: 'x'.repeat(121) } })
    await user.keyboard('{Enter}')
    expect(guardar).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Máximo 120 caracteres.')
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero')
  })

  it('creates the plan of a Sunday that has none on its first edit, and links its date', async () => {
    guardar.mockReturnValue(guardado(json('p22', '2026-11-22', { campos: { notas: 'Grabar clip' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const hoja = screen.getByRole('grid')
    expect(within(hoja).queryByRole('link', { name: /dom 22 nov/ })).not.toBeInTheDocument()
    act(() => celda('2026-11-22', 'notas').focus())
    await user.keyboard('G')
    await user.type(screen.getByRole('textbox', { name: 'Notas, 22 de noviembre' }), 'rabar clip')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: null, fecha: '2026-11-22', columna: 'notas', valor: 'Grabar clip' })
    await waitFor(() => expect(within(hoja).getByRole('link', { name: /dom 22 nov/ })).toHaveAttribute('href', '/dps/plan?plan=p22'))
    expect(celda('2026-11-22', 'notas')).toHaveTextContent('Grabar clip')
  })
})

describe('a plain servidor (S6)', () => {
  it('reads the same sheet without editing nor "Nueva serie"', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props({ editable: false })} />)
    expect(screen.queryByRole('button', { name: /Nueva serie/ })).not.toBeInTheDocument()
    expect(screen.getByRole('grid')).toHaveAttribute('aria-readonly', 'true')
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument()
    act(() => celda('2026-11-01', 'opener').focus())
    await user.keyboard('{Enter}')
    await user.keyboard('X')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(guardar).not.toHaveBeenCalled()
    await user.keyboard('{ArrowRight}')
    expect(celda('2026-11-01', 'anuncios')).toHaveFocus()
  })
})

describe('the toolbar', () => {
  it('filters one month and announces it', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), '10')
    const hoja = screen.getByRole('grid')
    expect(within(hoja).getAllByRole('rowheader').map((r) => r.textContent)).toContain('noviembre 20265 domingos')
    expect(document.querySelector('[data-fecha="2026-12-06"]')).toBeNull()
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Mostrando noviembre: 5 domingos.')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), '')
    expect(document.querySelector('[data-fecha="2026-12-06"]')).not.toBeNull()
  })

  it('hides columns, keeping at least one', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const boton = screen.getByRole('button', { name: /Columnas/ })
    expect(boton).toHaveTextContent('10/10')
    await user.click(boton)
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Notas' }))
    // The menu stays open to pick several; Escape closes it.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Notas' })).toHaveAttribute('aria-checked', 'false')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /Columnas/ })).toHaveTextContent('9/10')
    expect(within(screen.getByRole('grid')).queryByRole('columnheader', { name: 'Notas' })).not.toBeInTheDocument()
  })

  it('switches the density', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Condensado' }))
    expect(screen.getByRole('button', { name: 'Condensado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('grid')).toHaveAttribute('data-densidad', 'condensado')
  })

  it('changes the year through the URL', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Año' }), '2027')
    expect(push).toHaveBeenCalledWith('/dps/programacion?anio=2027')
  })
})

describe('Nueva serie', () => {
  it('creates the series on a run of Sundays, then reloads the year', async () => {
    crearSerie.mockResolvedValue({ ok: true, data: { serieId: 's2', planIds: ['n1', 'n2', 'n3'] } })
    cargar.mockResolvedValue({
      ok: true,
      data: leerPlanesHoja([...PLANES, json('n1', '2026-11-22', { serie: { ...SERIE, id: 's2', nombre: 'Lo que el corazón guarda', semanas: 3, color: 'chart-2' }, semana: 1 })]),
    })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Nueva serie/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva serie' })
    // Suggested: the Sunday after the series' last one.
    expect(within(dialogo).getByLabelText('Primer domingo')).toHaveValue('2026-11-22')
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Lo que el corazón guarda')
    const semanas = within(dialogo).getByLabelText('Semanas')
    await user.clear(semanas)
    await user.type(semanas, '3')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear 3 domingos' }))
    expect(crearSerie).toHaveBeenCalledWith({ nombre: 'Lo que el corazón guarda', primerDomingo: '2026-11-22', semanas: 3, color: 'chart-2' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cargar).toHaveBeenCalledWith({ anio: 2026 })
    expect(toast.success).toHaveBeenCalledWith('Creamos «Lo que el corazón guarda» con 3 domingos.')
    await waitFor(() => expect(within(screen.getByRole('grid')).getByText('Lo que el corazón guarda')).toBeInTheDocument())
    expect(cambiarPortada).not.toHaveBeenCalled()
  })

  it('warns before creating over Sundays of another series, and checks the date is a Sunday', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Nueva serie/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva serie' })
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Otra')
    fireEvent.change(within(dialogo).getByLabelText('Primer domingo'), { target: { value: '2026-11-08' } })
    expect(within(dialogo).getByText(/8 de noviembre ya es de «Tu casa tiene influencers»/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /Crear/ })).toBeDisabled()
    fireEvent.change(within(dialogo).getByLabelText('Primer domingo'), { target: { value: '2026-11-24' } })
    expect(within(dialogo).getByText('Elige un domingo.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /Crear/ })).toBeDisabled()
    expect(crearSerie).not.toHaveBeenCalled()
  })

  it('shows the refusal inside the dialog', async () => {
    crearSerie.mockResolvedValue({ ok: false, message: 'El domingo 29 de noviembre ya es de otra serie. Elige otro primer domingo o menos semanas.', codigo: 'domingo_ocupado' })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Nueva serie/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva serie' })
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Otra')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear 4 domingos' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('El domingo 29 de noviembre ya es de otra serie.')
    expect(cargar).not.toHaveBeenCalled()
  })

  it('uploads the optional cover on the first plan of the series', async () => {
    crearSerie.mockResolvedValue({ ok: true, data: { serieId: 's2', planIds: ['n1'] } })
    cargar.mockResolvedValue({ ok: true, data: leerPlanesHoja(PLANES) })
    cambiarPortada.mockResolvedValue({ ok: true, data: { imagenPath: 's2/1.png', url: null } })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Nueva serie/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva serie' })
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Otra')
    const archivo = new File([new Uint8Array([0x89, 0x50])], 'portada.png', { type: 'image/png' })
    await user.upload(within(dialogo).getByLabelText(/Portada/), archivo)
    await user.click(within(dialogo).getByRole('button', { name: /Crear/ }))
    await waitFor(() => expect(cambiarPortada).toHaveBeenCalledTimes(1))
    const datos = cambiarPortada.mock.calls[0][0] as FormData
    expect(datos.get('planId')).toBe('n1')
    expect(datos.get('imagen')).toBeInstanceOf(File)
  })
})

describe('without data', () => {
  it('says why when the year could not be read', () => {
    render(<ProgramacionClient {...props({ planes: [], error: 'No se pudo cargar la programación. Actualiza la página.' })} />)
    expect(screen.getByText('No se pudo cargar la programación')).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })
})
