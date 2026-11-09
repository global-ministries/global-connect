/**
 * Productor, Host, Comunicador and Cantantes in the programming sheet
 * (odd/tasks/dps-asistencia-pco.md, T11c, T14b; S11, S12.3, S12.4, S7.3):
 * each cell holds several people (up to 3; 8 in Cantantes). The editor
 * shows them as chips and a combobox that suggests only the people of the
 * column's list (from the page, no search while typing); ↑ ↓ and Enter (or
 * a click) add a person, a typed name is saved «Sin cuenta», Backspace on an
 * empty input or a chip's × removes someone, Escape cancels; the sheet's
 * keyboard model stays (Enter saves and moves down, Tab right). A linked
 * person and a written name read differently. Every name is fictitious.
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProgramacionClient, type ProgramacionClientProps } from '@/components/dps/programacion-client'
import * as acciones from '@/lib/actions/dps-programacion.actions'
import { listasVacias, type ListasDps } from '@/lib/platform/dps/listas'
import { leerPlanHoja, leerPlanesHoja, type PlanHoja } from '@/lib/platform/dps/programacion'

jest.mock('@/lib/actions/dps-programacion.actions', () => ({
  cargarProgramacionDps: jest.fn(),
  guardarCeldaDps: jest.fn(),
  crearSerieDps: jest.fn(),
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

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const ANA = { personaId: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Pérez', iniciales: 'AP' }
const ANDRES = { personaId: '22222222-2222-4222-8222-222222222222', nombre: 'Andrés Valero', iniciales: 'AV' }
const LIA = { personaId: '33333333-3333-4333-8333-333333333333', nombre: 'Lía Soto', iniciales: 'LS' }
const TOMAS = { personaId: '44444444-4444-4444-8444-444444444444', nombre: 'Tomás Gil', iniciales: 'TG' }

const LISTAS: ListasDps = {
  ...listasVacias(),
  productores: { lista: 'productores', puedeEditar: true, personas: [ANA, ANDRES] },
  hosts: { lista: 'hosts', puedeEditar: true, personas: [ANDRES] },
  cantantes: { lista: 'cantantes', puedeEditar: false, personas: [LIA, TOMAS] },
}

const persona = (p: { personaId: string; nombre: string }) => ({ persona_id: p.personaId, texto: null, nombre: p.nombre })
const escrita = (nombre: string) => ({ persona_id: null, texto: nombre, nombre })
const json = (id: string, fecha: string, personas: Record<string, unknown[]> = {}, parche: Record<string, unknown> = {}) => ({
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
  personas: { productor: [], host: [], comunicador: [], cantantes: [], ...personas },
  ...parche,
})
const PLANES = [
  json('p1', '2026-11-01', { productor: [escrita('Ximena Rangel')] }, { campos: { opener: 'Video: sala llena' } }),
  json('p8', '2026-11-08', { host: [persona(ANDRES)], cantantes: [persona(LIA), escrita('Coro invitado')] }),
  json('p15', '2026-11-15'),
  json('p22', '2026-11-22', { comunicador: [escrita('Uno'), escrita('Dos'), escrita('Tres')] }),
]

const props = (parche: Partial<ProgramacionClientProps> = {}): ProgramacionClientProps => ({
  anio: 2026,
  hoy: '2026-11-04',
  planes: leerPlanesHoja(PLANES),
  editable: true,
  listas: LISTAS,
  error: null,
  ...parche,
})

const celda = (fecha: string, columna: string): HTMLElement => {
  const td = document.querySelector<HTMLElement>(`[data-fecha="${fecha}"][data-columna="${columna}"]`)
  if (!td) throw new Error(`sin celda ${fecha} ${columna}`)
  return td
}
const guardado = (plan: Record<string, unknown>): ReturnType<typeof acciones.guardarCeldaDps> => Promise.resolve({ ok: true, data: leerPlanHoja(plan) as PlanHoja })
const opciones = () => within(screen.getByRole('listbox')).queryAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  jest.clearAllMocks()
})

async function abrir(user: ReturnType<typeof userEvent.setup>, fecha: string, columna: string): Promise<HTMLElement> {
  act(() => celda(fecha, columna).focus())
  await user.keyboard('{Enter}')
  return screen.getByRole('combobox', { name: /, \d+ de noviembre$/ })
}

describe('the person cells', () => {
  it('tell a linked person from a written name, several in one cell; the creative cells have no marker', () => {
    render(<ProgramacionClient {...props()} />)
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero (con ficha)')
    expect(within(celda('2026-11-08', 'host')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(celda('2026-11-08', 'cantantes')).toHaveTextContent('Lía Soto (con ficha), Coro invitado Sin cuenta')
    expect(within(celda('2026-11-01', 'productor')).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(celda('2026-11-01', 'opener')).queryByText('Sin cuenta')).not.toBeInTheDocument()
    expect(within(celda('2026-11-15', 'productor')).queryByText('Sin cuenta')).not.toBeInTheDocument()
  })

  it('show the same markers read-only, without an editor', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props({ editable: false })} />)
    expect(celda('2026-11-08', 'host')).toHaveTextContent('(con ficha)')
    act(() => celda('2026-11-01', 'productor').focus())
    await user.keyboard('{Enter}A')
    expect(screen.queryByRole('combobox', { name: /Productor,/ })).not.toBeInTheDocument()
  })
})

describe('the editor', () => {
  it('suggests only the column\'s list; typing filters it; ↓ and Enter add the person and move down', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { productor: [persona(ANDRES)] })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'productor')
    expect(combo).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Personas para Productor' })).toBeInTheDocument()
    expect(opciones()).toEqual(['APAna Pérez', 'AVAndrés Valero'])
    await user.type(combo, 'andres')
    expect(opciones()).toEqual(['AVAndrés Valero'])
    await user.keyboard('{ArrowDown}')
    const opcion = screen.getByRole('option', { name: /Andrés Valero/ })
    expect(opcion).toHaveAttribute('aria-selected', 'true')
    expect(combo).toHaveAttribute('aria-activedescendant', opcion.id)
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({
      planId: 'p15',
      fecha: '2026-11-15',
      columna: 'productor',
      valor: 'Andrés Valero',
      personas: [{ personaId: ANDRES.personaId, nombre: 'Andrés Valero' }],
    })
    expect(screen.queryByRole('combobox', { name: /Productor,/ })).not.toBeInTheDocument()
    expect(celda('2026-11-22', 'productor')).toHaveFocus()
    expect(celda('2026-11-15', 'productor')).toHaveTextContent('Andrés Valero (con ficha)')
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Productor del 15 de noviembre: Andrés Valero.')
  })

  it('keeps who is there and adds a written name («Sin cuenta») with Enter', async () => {
    guardar.mockReturnValue(guardado(json('p8', '2026-11-08', { host: [persona(ANDRES), escrita('Ps. Olmedo')] })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-08', 'host')
    expect(combo).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Quitar a Andrés Valero' })).toBeInTheDocument()
    // Andrés is the whole Hosts list and is already here.
    expect(screen.getByText('Nadie más de la lista de Hosts.')).toBeInTheDocument()
    await user.type(combo, 'Ps. Olmedo')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({
      planId: 'p8',
      fecha: '2026-11-08',
      columna: 'host',
      valor: 'Andrés Valero, Ps. Olmedo',
      personas: [
        { personaId: ANDRES.personaId, nombre: 'Andrés Valero' },
        { personaId: null, nombre: 'Ps. Olmedo' },
      ],
    })
    expect(within(celda('2026-11-08', 'host')).getByText('Sin cuenta')).toBeInTheDocument()
    expect(celda('2026-11-15', 'host')).toHaveFocus()
  })

  it('a click adds a chip and keeps editing; Enter on the empty input saves them all', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15', { cantantes: [persona(LIA), persona(TOMAS)] })))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'cantantes')
    await user.click(screen.getByRole('option', { name: /Lía Soto/ }))
    expect(screen.getByRole('button', { name: 'Quitar a Lía Soto' })).toBeInTheDocument()
    expect(combo).toHaveFocus()
    expect(opciones()).toEqual(['TGTomás Gil'])
    await user.click(screen.getByRole('option', { name: /Tomás Gil/ }))
    expect(guardar).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({
      planId: 'p15',
      fecha: '2026-11-15',
      columna: 'cantantes',
      valor: 'Lía Soto, Tomás Gil',
      personas: [
        { personaId: LIA.personaId, nombre: 'Lía Soto' },
        { personaId: TOMAS.personaId, nombre: 'Tomás Gil' },
      ],
    })
  })

  it('Backspace on the empty input and a chip\'s × remove people; Tab saves and moves right', async () => {
    guardar.mockReturnValue(guardado(json('p8', '2026-11-08')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrir(user, '2026-11-08', 'cantantes')
    await user.keyboard('{Backspace}')
    expect(screen.queryByRole('button', { name: 'Quitar a Coro invitado' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Lía Soto' }))
    await user.keyboard('{Tab}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p8', fecha: '2026-11-08', columna: 'cantantes', valor: '', personas: [] })
    expect(celda('2026-11-08', 'canciones')).toHaveFocus()
  })

  it('typing over a cell keeps who is there and starts the new name', async () => {
    guardar.mockReturnValue(guardado(json('p8', '2026-11-08')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-08', 'host').focus())
    await user.keyboard('P')
    const combo = screen.getByRole('combobox', { name: 'Host, 8 de noviembre' })
    expect(combo).toHaveValue('P')
    expect(screen.getByRole('button', { name: 'Quitar a Andrés Valero' })).toBeInTheDocument()
  })

  it('at the limit it suggests nobody and says so; another name is refused before saving', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-22', 'comunicador')
    expect(screen.getByText('Máximo 3 personas en Comunicador. Quita a alguien para agregar a otra.')).toBeInTheDocument()
    expect(opciones()).toEqual([])
    await user.type(combo, 'Cuatro')
    await user.keyboard('{Enter}')
    expect(guardar).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Máximo 3 personas en Comunicador.')
    expect(celda('2026-11-22', 'comunicador')).toHaveTextContent('Uno Sin cuenta, Dos Sin cuenta, Tres Sin cuenta')
  })

  it('Escape cancels: nothing saved, the old people and the focus stay', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-08', 'host')
    await user.keyboard('{Backspace}')
    await user.type(combo, 'Otro')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('combobox', { name: /Host,/ })).not.toBeInTheDocument()
    expect(guardar).not.toHaveBeenCalled()
    expect(celda('2026-11-08', 'host')).toHaveTextContent('Andrés Valero (con ficha)')
    expect(celda('2026-11-08', 'host')).toHaveFocus()
  })

  it('opening and leaving without a change saves nothing', async () => {
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrir(user, '2026-11-08', 'host')
    await user.keyboard('{Enter}')
    expect(guardar).not.toHaveBeenCalled()
    expect(celda('2026-11-15', 'host')).toHaveFocus()
  })

  it('says the list is empty and still saves a written name', async () => {
    guardar.mockReturnValue(guardado(json('p15', '2026-11-15')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    const combo = await abrir(user, '2026-11-15', 'comunicador')
    expect(screen.getByText('Nadie en la lista de Comunicadores todavía. Escribe el nombre para guardarlo sin cuenta.')).toBeInTheDocument()
    await user.type(combo, 'Ana')
    await user.keyboard('{Enter}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p15', fecha: '2026-11-15', columna: 'comunicador', valor: 'Ana', personas: [{ personaId: null, nombre: 'Ana' }] })
  })

  it('Delete clears the whole cell', async () => {
    guardar.mockReturnValue(guardado(json('p8', '2026-11-08')))
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    act(() => celda('2026-11-08', 'cantantes').focus())
    await user.keyboard('{Delete}')
    expect(guardar).toHaveBeenCalledWith({ planId: 'p8', fecha: '2026-11-08', columna: 'cantantes', valor: '', personas: [] })
  })

  it('rolls a failed save back and explains', async () => {
    guardar.mockResolvedValue({
      ok: false,
      message: 'Esa persona no está en la lista de esta columna. Revisa Configuración › Listas o escribe su nombre sin cuenta.',
      codigo: 'persona_fuera_de_lista',
    })
    const user = userEvent.setup()
    render(<ProgramacionClient {...props()} />)
    await abrir(user, '2026-11-01', 'productor')
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no está en la lista de esta columna')))
    expect(celda('2026-11-01', 'productor')).toHaveTextContent('Ximena Rangel')
    expect(within(celda('2026-11-01', 'productor')).getByText('Sin cuenta')).toBeInTheDocument()
  })
})
