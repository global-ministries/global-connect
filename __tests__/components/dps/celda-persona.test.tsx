/**
 * Productor, Host and Comunicador in the programming sheet
 * (odd/tasks/dps-asistencia-pco.md, T11c; S11, S7.3): the cell editor is a
 * combobox that searches people of the system (dps_buscar_personas through
 * buscarPersonasProgramacionDps, mocked) while typing; ↑ ↓ and Enter (or a
 * click) link a person, Enter without a pick saves the written name, Escape
 * cancels; a linked person and a written name («Sin cuenta») read
 * differently; the sheet's keyboard model stays. Every name is fictitious.
 */
import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProgramacionClient, type ProgramacionClientProps } from '@/components/dps/programacion-client'
import * as acciones from '@/lib/actions/dps-programacion.actions'
import { leerPlanHoja, leerPlanesHoja, type PlanHoja } from '@/lib/platform/dps/programacion'

jest.mock('@/lib/actions/dps-programacion.actions', () => ({
  cargarProgramacionDps: jest.fn(),
  guardarCeldaDps: jest.fn(),
  crearSerieDps: jest.fn(),
  buscarPersonasProgramacionDps: jest.fn(),
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
const guardar = mock(acciones.guardarCeldaDps)
const buscar = mock(acciones.buscarPersonasProgramacionDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const ANA = { personaId: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Pérez', iniciales: 'AP' }
const ANDRES = { personaId: '22222222-2222-4222-8222-222222222222', nombre: 'Andrés Valero', iniciales: 'AV' }

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
  json('p1', '2026-11-01', { productor: { persona_id: null, texto: 'Ximena Rangel', nombre: 'Ximena Rangel' }, campos: { opener: 'Video: sala llena' } }),
  json('p8', '2026-11-08', { host: { persona_id: ANDRES.personaId, texto: null, nombre: 'Andrés Valero' } }),
  json('p15', '2026-11-15'),
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
  buscar.mockResolvedValue({ ok: true, data: [ANA, ANDRES] })
})

async function abrir(user: ReturnType<typeof userEvent.setup>, fecha: string, columna: string): Promise<HTMLElement> {
  act(() => celda(fecha, columna).focus())
  await user.keyboard('{Enter}')
  return screen.getByRole('combobox', { name: /, \d+ de noviembre$/ })
}

/** The list once the search answered (it reads «Buscando…» before). */
const resultados = () => screen.findByRole('option', { name: /Ana Pérez/ }).then(() => screen.getByRole('listbox'))

describe('the person cells', () => {
  it('tell a linked person from a written name; the creative cells have no marker', () => {
    render(<ProgramacionClient {...props()} />)
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero (con ficha)')
    expect(within(celda('2026-11-08', 'host')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(celda('2026-11-01', 'productor')).getByText('Sin cuenta')).toBeInTheDocument()
    expect(celda('2026-11-01', 'productor')).toHaveTextContent('Ximena Rangel')
    expect(within(celda('2026-11-01', 'opener')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(celda('2026-11-15', 'productor')).queryByText('Sin cuenta')).not.toBeInTheDocument()
  })

  it('show the same markers read-only, without an editor', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props({ editable: false })} />)
    expect(celda('2026-11-08', 'host')).toHaveTextContent('(con ficha)')
    expect(within(celda('2026-11-01', 'productor')).getByText('Sin cuenta')).toBeInTheDocument()
    act(() => celda('2026-11-01', 'productor').focus())
    await user.keyboard('{Enter}A')
    expect(screen.queryByRole('combobox', { name: /Productor,/ })).not.toBeInTheDocument()
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('the combobox', () => {
  it('searches while typing; ↓ and Enter link the person and move down', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { productor: { persona_id: ANDRES.personaId, texto: null, nombre: 'Andrés Valero' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-15', 'productor').focus())
    await user.keyboard('A')
    const combo = screen.getByRole('combobox', { name: 'Productor, 15 de noviembre' })
    expect(combo).toHaveValue('A')
    expect(buscar).not.toHaveBeenCalled()
    await user.type(combo, 'n')
    expect(screen.getByRole('listbox', { name: 'Personas para Productor' })).toBeInTheDocument()
    const lista = await resultados()
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenLastCalledWith({ texto: 'An' })
    expect(combo).toHaveAttribute('aria-expanded', 'true')
    expect(within(lista).getAllByRole('option').map((o) => o.textContent)).toEqual(['APAna Pérez', 'AVAndrés Valero'])
    await user.keyboard('{ArrowDown}{ArrowDown}')
    const opcion = within(lista).getByRole('option', { name: /Andrés Valero/ })
    expect(opcion).toHaveAttribute('aria-selected', 'true')
    expect(combo).toHaveAttribute('aria-activedescendant', opcion.id)
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'productor', valor: 'Andrés Valero', personaId: ANDRES.personaId })
    expect(screen.queryByRole('combobox', { name: /Productor,/ })).not.toBeInTheDocument()
    expect(celda('2026-11-22', 'productor')).toHaveFocus()
    expect(celda('2026-11-15', 'productor')).toHaveTextContent('Andrés Valero (con ficha)')
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Productor del 15 de noviembre: Andrés Valero.')
  })

  it('Enter without a pick saves the written name («Sin cuenta»)', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { host: { persona_id: null, texto: 'Ps. Olmedo', nombre: 'Ps. Olmedo' } })))
    buscar.mockResolvedValue({ ok: true, data: [] })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'host')
    await user.type(combo, 'Ps. Olmedo')
    expect(await screen.findByText('Nadie con ese nombre en la plataforma.')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'host', valor: 'Ps. Olmedo' })
    expect(within(celda('2026-11-15', 'host')).getByText('Sin cuenta')).toBeInTheDocument()
    expect(celda('2026-11-22', 'host')).toHaveFocus()
  })

  it('↑ from the first person goes back to the text; Tab saves it and moves right', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'comunicador')
    await user.type(combo, 'Ana')
    await resultados()
    await user.keyboard('{ArrowDown}{ArrowUp}')
    expect(combo).not.toHaveAttribute('aria-activedescendant')
    await user.keyboard('{Tab}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'comunicador', valor: 'Ana' })
    expect(celda('2026-11-15', 'opener')).toHaveFocus()
  })

  it('a click on a person links them and keeps the cell selected', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { comunicador: { persona_id: ANA.personaId, texto: null, nombre: 'Ana Pérez' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'comunicador')
    await user.type(combo, 'Pér')
    await user.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
    expect(guardar).toHaveBeenCalledTimes(1)
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'comunicador', valor: 'Ana Pérez', personaId: ANA.personaId })
    expect(celda('2026-11-15', 'comunicador')).toHaveFocus()
  })

  it('opening a written name looks it up, so it can be linked', async () => {
    guardar.mockReturnValue(guardado(json('p1', '2026-11-01', { productor: { persona_id: ANA.personaId, texto: null, nombre: 'Ana Pérez' } })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-01', 'productor')
    expect(combo).toHaveValue('Ximena Rangel')
    await resultados()
    expect(buscar).toHaveBeenCalledWith({ texto: 'Ximena Rangel' })
    await user.keyboard('{ArrowDown}{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p1', fecha: '2026-11-01', columna: 'productor', valor: 'Ana Pérez', personaId: ANA.personaId })
  })

  it('Escape cancels: nothing saved, the old value and the focus stay', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-08', 'host')
    await user.clear(combo)
    await user.type(combo, 'Ana')
    await resultados()
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('combobox', { name: /Host,/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(guardar).not.toHaveBeenCalled()
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero (con ficha)')
    expect(celda('2026-11-08', 'host')).toHaveFocus()
  })

  it('picking the person already linked saves nothing', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrir(user, '2026-11-08', 'host')
    await resultados()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(guardar).not.toHaveBeenCalled()
    expect(celda('2026-11-15', 'host')).toHaveFocus()
  })

  it('says why the search failed and still saves the text', async () => {
    buscar.mockResolvedValue({ ok: false, message: 'Solo quienes arman el plan pueden cambiar la programación.', codigo: 'sin_autoridad' })
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'host')
    await user.type(combo, 'Ana')
    expect(await screen.findByText('Solo quienes arman el plan pueden cambiar la programación.')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'host', valor: 'Ana' })
  })

  it('rolls a failed link back and explains', async () => {
    guardar.mockResolvedValue({ ok: false, message: 'Esa persona ya no está en la plataforma. Búscala de nuevo.', codigo: 'persona_invalida' })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrir(user, '2026-11-01', 'productor')
    await resultados()
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esa persona ya no está en la plataforma. Búscala de nuevo.'))
    expect(celda('2026-11-01', 'productor')).toHaveTextContent('Ximena Rangel')
    expect(within(celda('2026-11-01', 'productor')).getByText('Sin cuenta')).toBeInTheDocument()
  })
})
