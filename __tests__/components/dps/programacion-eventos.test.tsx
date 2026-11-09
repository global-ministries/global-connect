/**
 * `<ProgramacionClient>` — special events (odd/tasks/dps-asistencia-pco.md,
 * T11b; S9, L44) and the sheet cells (S9.5, L45; S9.6, L46). The server
 * actions are mocked: «Nuevo evento» (one day or a range, its warnings and
 * the refusal inside the dialog), the event days as «Título · Día N de M»,
 * the row menu of a special row with «Mover fecha…» and «Eliminar evento»
 * (and why each is blocked), a read-only servidor without them; the cells
 * wrap instead of cutting the text, the editor shows it all, and the Serie
 * and Productor cells sit under their headers. Every name is fictitious.
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProgramacionClient, type ProgramacionClientProps } from '@/components/dps/programacion-client'
import * as acciones from '@/lib/actions/dps-programacion.actions'
import { leerPlanHoja, leerPlanesHoja, type PlanHoja } from '@/lib/platform/dps/programacion'

jest.mock('@/lib/actions/dps-programacion.actions', () => ({
  cargarProgramacionDps: jest.fn(),
  guardarCeldaDps: jest.fn(),
  crearSerieDps: jest.fn(),
  crearEventoDps: jest.fn(),
  moverPlanDps: jest.fn(),
  eliminarPlanDps: jest.fn(),
}))
jest.mock('@/lib/actions/dps-plan.actions', () => ({ cambiarPortadaDps: jest.fn() }))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dps/programacion',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const cargar = mock(acciones.cargarProgramacionDps)
const guardar = mock(acciones.guardarCeldaDps)
const crearEvento = mock(acciones.crearEventoDps)
const mover = mock(acciones.moverPlanDps)
const eliminar = mock(acciones.eliminarPlanDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4, primer_domingo: '2026-10-25' }
const LARGO = 'Primera vez / Próximos pasos / Bautizos del mes / Inscripciones abiertas para el retiro de jóvenes'
const EV = 'ev-1'
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
  evento: null,
  con_asistencia: false,
  ...parche,
})
const PLANES = [
  json('p1', '2026-11-01', { serie: SERIE, semana: 2, productor: { persona_id: null, texto: 'Ximena Rangel', nombre: 'Ximena Rangel' }, campos: { anuncios: LARGO } }),
  json('cena', '2026-11-04', { tipo: 'cena_del_senor', horarios: ['18:45'], con_asistencia: true }),
  json('ayer', '2026-11-03', { tipo: 'especial', titulo: 'Vigilia' }),
  json('p8', '2026-11-08', { serie: SERIE, semana: 3 }),
  json('d1', '2026-11-20', { tipo: 'especial', titulo: 'Conferencia Familias', evento: { id: EV, dia: 1, dias: 3 } }),
  json('d2', '2026-11-21', { tipo: 'especial', titulo: 'Conferencia Familias', evento: { id: EV, dia: 2, dias: 3 } }),
  json('d3', '2026-11-22', { tipo: 'especial', titulo: 'Conferencia Familias', evento: { id: EV, dia: 3, dias: 3 } }),
  json('bau', '2026-11-27', { tipo: 'especial', titulo: 'Bautizos', evento: { id: 'ev-2', dia: 1, dias: 1 } }),
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

async function abrirMenu(user: ReturnType<typeof userEvent.setup>, nombre: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: `Acciones de ${nombre}` }))
}

beforeEach(() => {
  jest.clearAllMocks()
  cargar.mockResolvedValue({ ok: true, data: leerPlanesHoja(PLANES) })
})

describe('the event days in the sheet', () => {
  it('shows each day of a multi-day event as «Título · Día N de M», together and by date', () => {
    render(<ProgramacionClient {...props()} />)
    const hoja = screen.getByRole('grid')
    expect(within(hoja).getByText('Conferencia Familias · Día 1 de 3')).toBeInTheDocument()
    expect(within(hoja).getByText('Conferencia Familias · Día 3 de 3')).toBeInTheDocument()
    expect(within(hoja).getByText('Bautizos')).toBeInTheDocument()
  })
})

describe('Nuevo evento', () => {
  it('creates a three-day event, then reloads the year', async () => {
    crearEvento.mockResolvedValue({ ok: true, data: { eventoId: 'ev-9', planes: [] } })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo evento' })
    expect(within(dialogo).getByLabelText('Del')).toHaveValue('2026-11-04')
    expect(within(dialogo).getByRole('button', { name: 'Crear 1 día' })).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Título'), 'Retiro de jóvenes')
    fireEvent.change(within(dialogo).getByLabelText('Del'), { target: { value: '2026-12-11' } })
    fireEvent.change(within(dialogo).getByLabelText(/^Al/), { target: { value: '2026-12-13' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Crear 3 días' }))
    expect(crearEvento).toHaveBeenCalledWith({ tipo: 'especial', titulo: 'Retiro de jóvenes', desde: '2026-12-11', hasta: '2026-12-13' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cargar).toHaveBeenCalledWith({ anio: 2026 })
    expect(toast.success).toHaveBeenCalledWith('Creamos «Retiro de jóvenes» (3 días).')
  })

  it('creates a one-day Cena del Señor with Al empty', async () => {
    crearEvento.mockResolvedValue({ ok: true, data: { eventoId: 'ev-9', planes: [] } })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo evento' })
    await user.selectOptions(within(dialogo).getByLabelText('Tipo'), 'cena_del_senor')
    await user.type(within(dialogo).getByLabelText('Título'), 'Cena de diciembre')
    fireEvent.change(within(dialogo).getByLabelText('Del'), { target: { value: '2026-12-01' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Crear 1 día' }))
    expect(crearEvento).toHaveBeenCalledWith({ tipo: 'cena_del_senor', titulo: 'Cena de diciembre', desde: '2026-12-01', hasta: null })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Creamos «Cena de diciembre».'))
  })

  it('warns about an inverted range, more than 14 days and a day that already has that event', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo evento' })
    await user.type(within(dialogo).getByLabelText('Título'), 'conferencia familias')
    fireEvent.change(within(dialogo).getByLabelText('Del'), { target: { value: '2026-11-22' } })
    fireEvent.change(within(dialogo).getByLabelText(/^Al/), { target: { value: '2026-11-20' } })
    expect(within(dialogo).getByText('El último día no puede ser antes del primero.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /Crear/ })).toBeDisabled()
    fireEvent.change(within(dialogo).getByLabelText(/^Al/), { target: { value: '2026-12-06' } })
    expect(within(dialogo).getByText('Un evento dura como máximo 14 días.')).toBeInTheDocument()
    fireEvent.change(within(dialogo).getByLabelText(/^Al/), { target: { value: '2026-11-23' } })
    expect(within(dialogo).getByText('El 22 de noviembre ya tiene «conferencia familias». Cambia el título o las fechas.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Crear 2 días' })).toBeDisabled()
    expect(crearEvento).not.toHaveBeenCalled()
  })

  it('shows the refusal inside the dialog', async () => {
    crearEvento.mockResolvedValue({ ok: false, message: 'Ya hay un evento de ese tipo con ese título el 5 de diciembre.', codigo: 'plan_duplicado' })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo evento' })
    await user.type(within(dialogo).getByLabelText('Título'), 'Otro')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear 1 día' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Ya hay un evento de ese tipo con ese título el 5 de diciembre.')
    expect(cargar).not.toHaveBeenCalled()
  })
})

describe('Mover fecha', () => {
  it('moves one day of the event to a new date, then reloads the year', async () => {
    mover.mockResolvedValue({ ok: true, data: leerPlanHoja(json('d1', '2026-11-25', { tipo: 'especial', titulo: 'Conferencia Familias' })) as PlanHoja })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Conferencia Familias · Día 1 de 3')
    await user.click(screen.getByRole('menuitem', { name: 'Mover fecha…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Mover fecha' })
    expect(dialogo).toHaveTextContent('Solo se mueve este día; los otros días del evento quedan donde están.')
    const fecha = within(dialogo).getByLabelText('Nueva fecha')
    expect(fecha).toHaveValue('2026-11-20')
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeDisabled()
    fireEvent.change(fecha, { target: { value: '2026-11-25' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(mover).toHaveBeenCalledWith({ planId: 'd1', fecha: '2026-11-25' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Movimos «Conferencia Familias · Día 1 de 3» al 25 de noviembre.')
    expect(cargar).toHaveBeenCalledWith({ anio: 2026 })
  })

  it('refuses a date before today', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Bautizos')
    await user.click(screen.getByRole('menuitem', { name: 'Mover fecha…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Mover fecha' })
    expect(dialogo).toHaveTextContent('Se mueve todo: convocados, orden y datos van a la fecha nueva.')
    fireEvent.change(within(dialogo).getByLabelText('Nueva fecha'), { target: { value: '2026-11-02' } })
    expect(within(dialogo).getByText('Elige una fecha de hoy en adelante.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeDisabled()
    expect(mover).not.toHaveBeenCalled()
  })

  it('explains why a day that already passed or has attendance cannot move', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Vigilia')
    await user.click(screen.getByRole('menuitem', { name: 'Mover fecha…' }))
    let dialogo = screen.getByRole('dialog', { name: 'Mover fecha' })
    expect(dialogo).toHaveTextContent('Este día ya pasó: no se puede mover.')
    expect(within(dialogo).queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    await abrirMenu(user, 'Cena del Señor')
    await user.click(screen.getByRole('menuitem', { name: 'Mover fecha…' }))
    dialogo = screen.getByRole('dialog', { name: 'Mover fecha' })
    expect(dialogo).toHaveTextContent('Este día ya tiene asistencia marcada: no se puede mover.')
  })

  it('shows the refusal of the RPC inside', async () => {
    mover.mockResolvedValue({ ok: false, message: 'Ya tiene asistencia marcada: no se puede mover ni eliminar.', codigo: 'plan_con_asistencia' })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Bautizos')
    await user.click(screen.getByRole('menuitem', { name: 'Mover fecha…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Mover fecha' })
    fireEvent.change(within(dialogo).getByLabelText('Nueva fecha'), { target: { value: '2026-11-28' } })
    await user.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Ya tiene asistencia marcada')
    expect(cargar).not.toHaveBeenCalled()
  })
})

describe('Eliminar evento', () => {
  it('deletes a one-day event after confirming', async () => {
    eliminar.mockResolvedValue({ ok: true, data: { eliminados: 1 } })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Bautizos')
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar evento' }))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar «Bautizos»?' })
    expect(dialogo).toHaveTextContent('Se quita el plan del 27 de noviembre con sus convocados. No se puede deshacer.')
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar' }))
    expect(eliminar).toHaveBeenCalledWith({ planId: 'bau', todoElEvento: false })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Eliminamos «Bautizos».')
    expect(cargar).toHaveBeenCalledWith({ anio: 2026 })
  })

  it('offers one day or every day of a multi-day event', async () => {
    eliminar.mockResolvedValue({ ok: true, data: { eliminados: 3 } })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Conferencia Familias · Día 2 de 3')
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar evento' }))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar «Conferencia Familias»?' })
    expect(within(dialogo).getByRole('button', { name: 'Eliminar solo este día' })).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Eliminar los 3 días' }))
    expect(eliminar).toHaveBeenCalledWith({ planId: 'd2', todoElEvento: true })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Eliminamos «Conferencia Familias» (3 días).'))
  })

  it('explains why a day with attendance is not deleted', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrirMenu(user, 'Cena del Señor')
    await user.click(screen.getByRole('menuitem', { name: 'Eliminar evento' }))
    const dialogo = screen.getByRole('alertdialog')
    expect(dialogo).toHaveTextContent('Este día ya tiene asistencia marcada: no se puede eliminar.')
    expect(within(dialogo).queryByRole('button', { name: /^Eliminar/ })).not.toBeInTheDocument()
    expect(eliminar).not.toHaveBeenCalled()
  })
})

describe('a plain servidor (S6)', () => {
  it('sees the events without «Nuevo evento» nor the row menu', () => {
    render(<ProgramacionClient {...props({ editable: false })} />)
    expect(within(screen.getByRole('grid')).getByText('Conferencia Familias · Día 1 de 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo evento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument()
  })
})

describe('the cells (S9.5, S9.6)', () => {
  it('never cuts a text: every cell wraps and the row grows', () => {
    render(<ProgramacionClient {...props()} />)
    const td = celda('2026-11-01', 'anuncios')
    expect(td).toHaveTextContent(LARGO)
    expect(td).not.toHaveClass('truncate')
    expect(td).toHaveClass('whitespace-normal')
    for (const c of screen.getByRole('grid').querySelectorAll('td, th')) expect(c).not.toHaveClass('truncate')
  })

  it('edits in a text area that shows the whole text; Enter still saves', async () => {
    guardar.mockResolvedValue({ ok: true, data: leerPlanHoja(json('p1', '2026-11-01', { campos: { anuncios: `${LARGO}.` } })) as PlanHoja })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-01', 'anuncios').focus())
    await user.keyboard('{Enter}')
    const editor = screen.getByRole('textbox', { name: 'Anuncios, 1 de noviembre' })
    expect(editor.tagName).toBe('TEXTAREA')
    expect(editor).toHaveValue(LARGO)
    await user.type(editor, '.')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p1', fecha: '2026-11-01', columna: 'anuncios', valor: `${LARGO}.` })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('puts Serie and Productor under their headers: same sticky offsets, one width per column', () => {
    render(<ProgramacionClient {...props()} />)
    const hoja = screen.getByRole('grid')
    const encabezados = within(hoja).getAllByRole('columnheader')
    const fila = celda('2026-11-01', 'productor').closest('tr')!
    const celdas = Array.from(fila.children) as HTMLElement[]
    expect(celdas[1]).toHaveTextContent('Tu casa tiene influencers')
    expect(celdas[2]).toBe(celda('2026-11-01', 'productor'))
    expect(celdas[2]).toHaveTextContent('Ximena Rangel')
    expect(encabezados[2]).toHaveTextContent('Productor')
    // Fecha and Serie are sticky with the same offset in the header and the body.
    for (const [i, left] of [
      [0, 'left-0'],
      [1, 'left-[146px]'],
    ] as const) {
      expect(encabezados[i]).toHaveClass('sticky', left)
      expect(celdas[i]).toHaveClass('sticky', left)
      expect(celdas[i]).not.toHaveClass('relative')
    }
    // A special row keeps the same two sticky cells.
    const especial = Array.from(within(hoja).getByText('Bautizos').closest('tr')!.children) as HTMLElement[]
    expect(especial[0]).toHaveClass('sticky', 'left-0')
    expect(especial[1]).toHaveClass('sticky', 'left-[146px]')
    // One fixed width per column, shared by every row.
    const anchos = [...hoja.querySelectorAll('colgroup > col')].map((c) => (c as HTMLElement).style.width)
    expect(anchos.slice(0, 3)).toEqual(['146px', '250px', '150px'])
    expect(anchos).toHaveLength(encabezados.length)
    expect(hoja).toHaveClass('table-fixed')
  })
})
