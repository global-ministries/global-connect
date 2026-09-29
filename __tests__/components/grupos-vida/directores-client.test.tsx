/**
 * `<DirectoresClient>` — island of /grupos-vida/directores.
 *
 * The view model has its own suite; here: the header and the Por ordenar strip
 * (its actions are links), the tabs mirrored in the URL, the general director
 * cards (the two-option scope per segment, the checklist, "Agregar segmento",
 * "Cambiar alcance"), the save contract (each change calls its server action,
 * shows pending state and restores the previous value when it fails), the
 * read-only mode, the stage directors list and the "Agregar director" dialog.
 *
 * The table and the phone cards are both rendered (jsdom applies no
 * breakpoints), so table assertions are scoped to the "Directores de etapa"
 * table.
 */
import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DirectoresClient } from '@/components/grupos-vida/directores/directores-client'
import { construirVistaDirectores, type EntradaVistaDirectores } from '@/lib/platform/grupos-vida/directores-vista'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/grupos-vida/directores',
}))

// ContenedorDashboard lazy-loads its header behind Suspense — same synchronous
// test double as the Dream Team suites.
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

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const cambiarAlcanceDG = jest.fn()
const marcarDirectoresDG = jest.fn()
const agregarDirectorGeneral = jest.fn()
const asignarTodosLosSegmentosDG = jest.fn()
const buscarPersonasParaDirectorGeneral = jest.fn()
const asignarSegmentoDG = jest.fn()
jest.mock('@/lib/actions/gdv-directores.actions', () => ({
  cambiarAlcanceDG: (...a: unknown[]) => cambiarAlcanceDG(...a),
  marcarDirectoresDG: (...a: unknown[]) => marcarDirectoresDG(...a),
  agregarDirectorGeneral: (...a: unknown[]) => agregarDirectorGeneral(...a),
  asignarTodosLosSegmentosDG: (...a: unknown[]) => asignarTodosLosSegmentosDG(...a),
  buscarPersonasParaDirectorGeneral: (...a: unknown[]) => buscarPersonasParaDirectorGeneral(...a),
}))
jest.mock('@/lib/actions/dg-segmentos.actions', () => ({
  asignarSegmentoDG: (...a: unknown[]) => asignarSegmentoDG(...a),
}))

const SEG_H = 'seg-hombres'
const SEG_M = 'seg-matrimonios'
const SEG_W = 'seg-mujeres'
const DG_MARIA = 'dg-maria'
const DG_EDUARDO = 'dg-eduardo'

const grupo = (id: string, segmentoId: string, extra: Record<string, unknown> = {}) => ({
  id,
  segmentoId,
  activo: true,
  eliminado: false,
  estadoAprobacion: 'aprobado',
  ...extra,
})

function entrada(overrides: Partial<EntradaVistaDirectores> = {}): EntradaVistaDirectores {
  return {
    segmentos: [
      { id: SEG_H, nombre: 'Hombre +36' },
      { id: SEG_M, nombre: 'Matrimonios' },
      { id: SEG_W, nombre: 'Mujeres +36' },
    ],
    grupos: [grupo('g1', SEG_H), grupo('g2', SEG_M), grupo('g3', SEG_M), grupo('g4', SEG_W)],
    directoresEtapa: [
      { id: 'de-carlos', usuarioId: 'u-carlos', segmentoId: SEG_H, nombre: 'Carlos Caballero', ciudad: 'Barquisimeto', tieneCuenta: true },
      { id: 'de-joel', usuarioId: 'u-joel', segmentoId: SEG_M, nombre: 'Joel González', ciudad: 'Cabudare', tieneCuenta: false },
      { id: 'de-ana', usuarioId: 'u-ana', segmentoId: SEG_M, nombre: 'Ana Álvarez', ciudad: 'Barquisimeto', tieneCuenta: true },
      { id: 'de-bea', usuarioId: 'u-bea', segmentoId: SEG_W, nombre: 'Bea Medina', ciudad: null, tieneCuenta: true },
    ],
    enlaces: [
      { directorId: 'de-carlos', grupoId: 'g1' },
      { directorId: 'de-joel', grupoId: 'g2' },
      { directorId: 'de-ana', grupoId: 'g3' },
      { directorId: 'de-bea', grupoId: 'g4' },
    ],
    generales: [
      { usuarioId: DG_MARIA, nombre: 'María Eugenia Pacheco', roles: ['director-general'] },
      { usuarioId: DG_EDUARDO, nombre: 'Eduardo Durán', roles: ['admin', 'director-general'] },
    ],
    alcances: [
      { usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'segmento' },
      { usuarioId: DG_MARIA, segmentoId: SEG_W, alcance: 'segmento' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_H, alcance: 'segmento' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_M, alcance: 'segmento' },
      { usuarioId: DG_EDUARDO, segmentoId: SEG_W, alcance: 'segmento' },
    ],
    marcas: [{ usuarioId: DG_MARIA, directorId: 'de-joel' }],
    personasConRolDirectorEtapa: [],
    usuariosConSegmentoLider: ['u-carlos', 'u-joel', 'u-ana', 'u-bea'],
    soloLectura: false,
    ...overrides,
  }
}

function montar(overrides: Partial<EntradaVistaDirectores> = {}, tabInicial: 'generales' | 'etapa' = 'generales') {
  return render(<DirectoresClient vista={construirVistaDirectores(entrada(overrides))} tabInicial={tabInicial} />)
}

const tarjeta = (nombre: string) => screen.getByRole('article', { name: nombre })
const tablaEtapa = () => screen.getByRole('table', { name: 'Directores de etapa' })
const nombresEnTabla = () =>
  within(tablaEtapa())
    .getAllByRole('row')
    .filter((r) => within(r).queryAllByRole('cell').length > 0)
    // the first <span> of the first cell is the name (the avatar is a <div>)
    .map((r) => within(r).getAllByRole('cell')[0].querySelector('span')?.textContent ?? '')

beforeEach(() => {
  jest.clearAllMocks()
  cambiarAlcanceDG.mockResolvedValue({ success: true })
  marcarDirectoresDG.mockResolvedValue({ success: true })
  agregarDirectorGeneral.mockResolvedValue({ success: true })
  asignarTodosLosSegmentosDG.mockResolvedValue({ success: true })
  asignarSegmentoDG.mockResolvedValue({ success: true })
  buscarPersonasParaDirectorGeneral.mockResolvedValue({ success: true, data: [] })
})

describe('DirectoresClient — header and tabs', () => {
  it('shows the title, the subtitle and the primary action', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Directores' })).toBeInTheDocument()
    expect(screen.getByText('Directores generales y de etapa de Grupos de Vida')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Agregar director' }).length).toBeGreaterThan(0)
  })

  it('shows both tabs with their counts and opens the one from the URL', () => {
    montar({}, 'etapa')
    expect(screen.getByRole('tab', { name: 'Directores generales 2' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Directores de etapa 4' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Directores de etapa' })).toBeInTheDocument()
  })

  it('switching tab shows its panel and mirrors it in the URL', async () => {
    montar()
    expect(screen.getByRole('tabpanel', { name: 'Directores generales' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Directores de etapa/ }))
    expect(screen.getByRole('tabpanel', { name: 'Directores de etapa' })).toBeInTheDocument()
    expect(replace).toHaveBeenLastCalledWith('/grupos-vida/directores?tab=etapa', { scroll: false })

    await userEvent.click(screen.getByRole('tab', { name: /Directores generales/ }))
    expect(replace).toHaveBeenLastCalledWith('/grupos-vida/directores', { scroll: false })
  })
})

describe('DirectoresClient — Por ordenar', () => {
  it('is not rendered when there is nothing to sort out', () => {
    montar()
    expect(screen.queryByRole('region', { name: 'Por ordenar' })).not.toBeInTheDocument()
    expect(screen.queryByText(/pendientes por ordenar/)).not.toBeInTheDocument()
  })

  it('renders one block per item and the actions are links', () => {
    montar({
      grupos: [...entrada().grupos, grupo('n1', SEG_H), grupo('p1', SEG_M, { activo: false, estadoAprobacion: 'pendiente' })],
      personasConRolDirectorEtapa: [{ id: 'u-ingrid', nombre: 'Ingrid Díaz de Caballero' }],
    })
    const franja = screen.getByRole('region', { name: 'Por ordenar' })

    expect(within(franja).getByText('1 grupo activo sin director de etapa')).toBeInTheDocument()
    expect(within(franja).getByText('Todos en Hombre +36')).toBeInTheDocument()
    expect(within(franja).getByRole('link', { name: 'Asignar director' })).toHaveAttribute(
      'href',
      `/grupos-vida/segmentos/${SEG_H}/directores`,
    )
    expect(within(franja).getByRole('link', { name: 'Revisar solicitudes' })).toHaveAttribute('href', '/grupos-vida/solicitudes')
    expect(within(franja).getByRole('link', { name: 'Asignar segmento' })).toHaveAttribute('href', '/grupos-vida/segmentos')
  })

  it('on phones it is one collapsible row that counts the pending items', async () => {
    montar({
      grupos: [...entrada().grupos, grupo('n1', SEG_H)],
      personasConRolDirectorEtapa: [{ id: 'u-ingrid', nombre: 'Ingrid' }],
    })
    const boton = screen.getByRole('button', { name: '2 pendientes por ordenar' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
  })

  it('uses the singular for one pending item', () => {
    montar({ grupos: [...entrada().grupos, grupo('n1', SEG_H)] })
    expect(screen.getByRole('button', { name: '1 pendiente por ordenar' })).toBeInTheDocument()
  })
})

describe('DirectoresClient — general director cards', () => {
  it('shows the card with its badge, summary and, for someone who holds every segment, "Todos los segmentos"', () => {
    montar()
    const eduardo = tarjeta('Eduardo Durán')
    expect(within(eduardo).getByText('Administrador')).toBeInTheDocument()
    expect(within(eduardo).getByText('3 segmentos · 4 directores de etapa · 4 grupos')).toBeInTheDocument()
    expect(within(eduardo).getByText('Todos los segmentos')).toBeInTheDocument()
    expect(within(eduardo).getByText('Ve y administra todos los grupos')).toBeInTheDocument()
    expect(within(eduardo).queryByRole('group', { name: /Alcance en/ })).not.toBeInTheDocument()
  })

  it('"Cambiar alcance" reveals the segments of a card that holds all of them', async () => {
    montar()
    const eduardo = tarjeta('Eduardo Durán')
    const boton = within(eduardo).getByRole('button', { name: 'Cambiar alcance' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(within(eduardo).getByRole('group', { name: 'Alcance en Matrimonios' })).toBeInTheDocument()
  })

  it('shows one scope control per segment with "Todo el segmento" pressed and the helper text', () => {
    montar()
    const maria = tarjeta('María Eugenia Pacheco')
    const control = within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })
    expect(within(control).getByRole('button', { name: 'Todo el segmento' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(control).getByRole('button', { name: 'Solo estos directores' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(maria).getAllByText('Incluye los grupos sin director de etapa').length).toBe(2)
    expect(within(maria).getByText('2 directores de etapa · 2 grupos activos')).toBeInTheDocument()
    expect(within(maria).getByText('2 grupos visibles')).toBeInTheDocument()
    expect(within(maria).queryByRole('group', { name: 'Directores de etapa de Matrimonios' })).not.toBeInTheDocument()
  })

  it('choosing "Solo estos directores" calls the action, marks the option and shows the checklist', async () => {
    montar()
    const maria = tarjeta('María Eugenia Pacheco')

    await userEvent.click(within(within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })).getByRole('button', { name: 'Solo estos directores' }))

    expect(cambiarAlcanceDG).toHaveBeenCalledWith(DG_MARIA, SEG_M, 'directores')
    const control = within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })
    expect(within(control).getByRole('button', { name: 'Solo estos directores' })).toHaveAttribute('aria-pressed', 'true')
    const lista = within(maria).getByRole('group', { name: 'Directores de etapa de Matrimonios' })
    expect(within(lista).getByRole('checkbox', { name: /Joel González/ })).toBeChecked()
    expect(within(lista).getByRole('checkbox', { name: /Ana Álvarez/ })).not.toBeChecked()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalled()
  })

  it('restores the previous scope and reports the error when saving fails', async () => {
    cambiarAlcanceDG.mockResolvedValue({ success: false, error: 'No autorizado' })
    montar()
    const maria = tarjeta('María Eugenia Pacheco')

    await userEvent.click(within(within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })).getByRole('button', { name: 'Solo estos directores' }))

    const control = within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })
    await waitFor(() => expect(within(control).getByRole('button', { name: 'Todo el segmento' })).toHaveAttribute('aria-pressed', 'true'))
    expect(within(control).getByRole('button', { name: 'Solo estos directores' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(maria).queryByRole('group', { name: 'Directores de etapa de Matrimonios' })).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('No autorizado')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('disables the control of that segment while it saves and enables it afterwards', async () => {
    let terminar: (v: { success: boolean }) => void = () => {}
    cambiarAlcanceDG.mockReturnValue(new Promise((resolve) => (terminar = resolve)))
    montar()
    const maria = tarjeta('María Eugenia Pacheco')
    const control = within(maria).getByRole('group', { name: 'Alcance en Matrimonios' })

    await userEvent.click(within(control).getByRole('button', { name: 'Solo estos directores' }))
    expect(within(control).getByRole('button', { name: 'Todo el segmento' })).toBeDisabled()
    expect(within(control).getByRole('button', { name: 'Solo estos directores' })).toBeDisabled()
    // the other segment is not blocked
    expect(within(within(maria).getByRole('group', { name: 'Alcance en Mujeres +36' })).getByRole('button', { name: 'Todo el segmento' })).toBeEnabled()

    await act(async () => terminar({ success: true }))
    expect(within(control).getByRole('button', { name: 'Todo el segmento' })).toBeEnabled()
  })

  it('a checkbox change sends the whole marked list of that segment', async () => {
    montar({ alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }] })
    const maria = tarjeta('María Eugenia Pacheco')
    const lista = within(maria).getByRole('group', { name: 'Directores de etapa de Matrimonios' })

    await userEvent.click(within(lista).getByRole('checkbox', { name: /Ana Álvarez/ }))

    expect(marcarDirectoresDG).toHaveBeenCalledWith(DG_MARIA, SEG_M, expect.arrayContaining(['de-joel', 'de-ana']))
    expect(marcarDirectoresDG.mock.calls[0][2]).toHaveLength(2)
    expect(within(lista).getByRole('checkbox', { name: /Ana Álvarez/ })).toBeChecked()
    expect(within(lista).getByText('Cabudare · 1 grupo')).toBeInTheDocument()
  })

  it('unchecking a director sends the list without them', async () => {
    montar({ alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }] })
    const lista = within(tarjeta('María Eugenia Pacheco')).getByRole('group', { name: 'Directores de etapa de Matrimonios' })

    await userEvent.click(within(lista).getByRole('checkbox', { name: /Joel González/ }))

    expect(marcarDirectoresDG).toHaveBeenCalledWith(DG_MARIA, SEG_M, [])
  })

  it('restores the checkbox and reports the error when saving the marks fails', async () => {
    marcarDirectoresDG.mockResolvedValue({ success: false, error: 'boom' })
    montar({ alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }] })
    const lista = within(tarjeta('María Eugenia Pacheco')).getByRole('group', { name: 'Directores de etapa de Matrimonios' })

    await userEvent.click(within(lista).getByRole('checkbox', { name: /Ana Álvarez/ }))

    await waitFor(() => expect(within(lista).getByRole('checkbox', { name: /Ana Álvarez/ })).not.toBeChecked())
    expect(within(lista).getByRole('checkbox', { name: /Joel González/ })).toBeChecked()
    expect(toast.error).toHaveBeenCalledWith('boom')
  })

  it('reports an exception from the action and restores the value', async () => {
    cambiarAlcanceDG.mockRejectedValue(new Error('network'))
    montar()
    const control = within(tarjeta('María Eugenia Pacheco')).getByRole('group', { name: 'Alcance en Matrimonios' })

    await userEvent.click(within(control).getByRole('button', { name: 'Solo estos directores' }))

    await waitFor(() => expect(within(control).getByRole('button', { name: 'Todo el segmento' })).toHaveAttribute('aria-pressed', 'true'))
    expect(toast.error).toHaveBeenCalledWith('No se pudo guardar el cambio.')
  })

  it('"Agregar segmento" lists the segments the person does not hold and assigns the chosen one', async () => {
    montar()
    const maria = tarjeta('María Eugenia Pacheco')

    await userEvent.click(within(maria).getByRole('button', { name: 'Agregar segmento' }))
    await userEvent.click(within(maria).getByRole('button', { name: 'Hombre +36' }))

    expect(asignarSegmentoDG).toHaveBeenCalledWith({ usuarioId: DG_MARIA, segmentoId: SEG_H })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('does not offer "Agregar segmento" to someone who holds them all', () => {
    montar()
    expect(within(tarjeta('Eduardo Durán')).queryByRole('button', { name: 'Agregar segmento' })).not.toBeInTheDocument()
  })

  it('reports an error assigning a segment', async () => {
    asignarSegmentoDG.mockResolvedValue({ success: false, error: 'Ya asignado' })
    montar()
    const maria = tarjeta('María Eugenia Pacheco')
    await userEvent.click(within(maria).getByRole('button', { name: 'Agregar segmento' }))
    await userEvent.click(within(maria).getByRole('button', { name: 'Hombre +36' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ya asignado'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('every interactive control is at least 44px tall', () => {
    montar()
    const maria = tarjeta('María Eugenia Pacheco')
    for (const boton of within(maria).getAllByRole('button')) {
      expect(boton.className).toMatch(/min-h-\[44px\]/)
    }
  })
})

describe('DirectoresClient — read-only mode (a director general viewing)', () => {
  const soloLectura = { soloLectura: true, generales: [entrada().generales[0]] }

  it('has no primary action, no scope control, no checkboxes and no "Agregar segmento"', () => {
    montar({ ...soloLectura, alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }] })

    expect(screen.queryByRole('button', { name: 'Agregar director' })).not.toBeInTheDocument()
    const maria = tarjeta('María Eugenia Pacheco')
    expect(within(maria).queryByRole('group', { name: /Alcance en/ })).not.toBeInTheDocument()
    expect(within(maria).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(maria).queryByRole('button', { name: 'Agregar segmento' })).not.toBeInTheDocument()
    expect(within(maria).queryByRole('button', { name: 'Cambiar alcance' })).not.toBeInTheDocument()
  })

  it('shows the scope as a badge and who is included', () => {
    montar({ ...soloLectura, alcances: [{ usuarioId: DG_MARIA, segmentoId: SEG_M, alcance: 'directores' }] })
    const maria = tarjeta('María Eugenia Pacheco')
    expect(within(maria).getByText('Solo estos directores')).toBeInTheDocument()
    expect(within(maria).getByText('Incluye a Joel González')).toBeInTheDocument()
    expect(within(maria).getByText('1 grupo visible')).toBeInTheDocument()
  })

  it('shows "Todo el segmento" as a badge too', () => {
    montar(soloLectura)
    expect(within(tarjeta('María Eugenia Pacheco')).getAllByText('Todo el segmento').length).toBeGreaterThan(0)
  })

  it('never calls a server action', () => {
    montar(soloLectura)
    expect(cambiarAlcanceDG).not.toHaveBeenCalled()
    expect(marcarDirectoresDG).not.toHaveBeenCalled()
  })
})

describe('DirectoresClient — stage directors', () => {
  it('lists them in the table with segment, city, groups, who they answer to and account', () => {
    montar({}, 'etapa')
    expect(nombresEnTabla()).toEqual(['Carlos Caballero', 'Ana Álvarez', 'Joel González', 'Bea Medina'])

    const joel = within(tablaEtapa()).getByRole('row', { name: /Joel González/ })
    expect(within(joel).getByText('Matrimonios')).toBeInTheDocument()
    expect(within(joel).getByText('Cabudare')).toBeInTheDocument()
    expect(within(joel).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(joel).getByRole('img', { name: 'Responde a: Eduardo Durán, María Eugenia Pacheco' })).toBeInTheDocument()
    expect(within(joel).getByText('Eduardo +1')).toBeInTheDocument()
  })

  it('flags a director without groups and links "Ver grupos" to the segment directors screen', () => {
    montar({ enlaces: [{ directorId: 'de-carlos', grupoId: 'g1' }] }, 'etapa')
    const bea = within(tablaEtapa()).getByRole('row', { name: /Bea Medina/ })
    expect(within(bea).getByText('Sin grupos asignados')).toBeInTheDocument()
    expect(within(bea).getByRole('link', { name: 'Ver grupos de Bea Medina' })).toHaveAttribute(
      'href',
      `/grupos-vida/segmentos/${SEG_W}/directores`,
    )
    expect(within(bea).getByText('Sin ciudad')).toBeInTheDocument()
  })

  it('searches by name ignoring accents and case, and shows the footer count', async () => {
    montar({}, 'etapa')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar director' }), 'GONZALEZ')

    expect(nombresEnTabla()).toEqual(['Joel González'])
    expect(screen.getByText('Mostrando 1 de 4 directores de etapa')).toBeInTheDocument()
  })

  it('filters by segment with the counts on the chips', async () => {
    montar({}, 'etapa')
    const chips = screen.getByRole('group', { name: 'Filtrar por segmento' })
    expect(within(chips).getByRole('button', { name: 'Todos 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chips).getByRole('button', { name: 'Matrimonios 2' })).toBeInTheDocument()

    await userEvent.click(within(chips).getByRole('button', { name: 'Matrimonios 2' }))
    expect(nombresEnTabla()).toEqual(['Ana Álvarez', 'Joel González'])
    expect(within(chips).getByRole('button', { name: 'Matrimonios 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the empty message when nothing matches', async () => {
    montar({}, 'etapa')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar director' }), 'zzz')
    expect(screen.getByText('Ningún director coincide con la búsqueda')).toBeInTheDocument()
    expect(screen.getByText('Cambia el texto o elige otro segmento.')).toBeInTheDocument()
  })
})

describe('DirectoresClient — Agregar director', () => {
  const PERSONA = { id: '11111111-1111-4111-8111-111111111111', nombre: 'Luis Pérez', roles: ['Líder'] }

  async function abrirYElegirPersona() {
    buscarPersonasParaDirectorGeneral.mockResolvedValue({ success: true, data: [PERSONA] })
    montar()
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar director' })[0])
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar director general' })
    await userEvent.type(within(dialogo).getByRole('searchbox', { name: 'Buscar persona' }), 'luis')
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Luis Pérez/ }))
    return dialogo
  }

  it('searches people by name and shows their current roles', async () => {
    buscarPersonasParaDirectorGeneral.mockResolvedValue({ success: true, data: [PERSONA] })
    montar()
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar director' })[0])
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar director general' })

    await userEvent.type(within(dialogo).getByRole('searchbox', { name: 'Buscar persona' }), 'luis')

    const resultado = await within(dialogo).findByRole('button', { name: /Luis Pérez/ })
    expect(resultado).toHaveTextContent('Líder')
    expect(buscarPersonasParaDirectorGeneral).toHaveBeenLastCalledWith('luis')
  })

  it('"Todos los segmentos" adds the role and every segment', async () => {
    const dialogo = await abrirYElegirPersona()

    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Todos los segmentos' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(asignarTodosLosSegmentosDG).toHaveBeenCalledWith(PERSONA.id))
    expect(agregarDirectorGeneral).toHaveBeenCalledWith(PERSONA.id)
    expect(asignarSegmentoDG).not.toHaveBeenCalled()
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalled()
  })

  it('"Elegir segmentos" adds the role and only the chosen segments', async () => {
    const dialogo = await abrirYElegirPersona()

    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Elegir segmentos' }))
    expect(within(dialogo).getByRole('button', { name: 'Agregar' })).toBeDisabled()
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Matrimonios' }))
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Mujeres +36' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(asignarSegmentoDG).toHaveBeenCalledTimes(2))
    expect(agregarDirectorGeneral).toHaveBeenCalledWith(PERSONA.id)
    expect(asignarSegmentoDG).toHaveBeenCalledWith({ usuarioId: PERSONA.id, segmentoId: SEG_M })
    expect(asignarSegmentoDG).toHaveBeenCalledWith({ usuarioId: PERSONA.id, segmentoId: SEG_W })
    expect(asignarTodosLosSegmentosDG).not.toHaveBeenCalled()
  })

  it('does not assign segments and reports the error when adding the role fails', async () => {
    agregarDirectorGeneral.mockResolvedValue({ success: false, error: 'No autorizado' })
    const dialogo = await abrirYElegirPersona()

    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Todos los segmentos' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No autorizado'))
    expect(asignarTodosLosSegmentosDG).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Agregar director general' })).toBeInTheDocument()
  })

  it('reports it, and refreshes, when the person became director general but the segments failed', async () => {
    asignarTodosLosSegmentosDG.mockResolvedValue({ success: false, error: 'boom' })
    const dialogo = await abrirYElegirPersona()

    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Todos los segmentos' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.error.mock.calls[0][0]).toMatch(/director general/i)
    expect(refresh).toHaveBeenCalled()
  })

  it('treats a segment assignment that fails without a message as a failure: no success toast, no more segments', async () => {
    asignarSegmentoDG.mockResolvedValue({ success: false })
    const dialogo = await abrirYElegirPersona()

    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Elegir segmentos' }))
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Matrimonios' }))
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: 'Mujeres +36' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.error.mock.calls[0][0]).toMatch(/no se pudieron asignar los segmentos: error desconocido/)
    expect(toast.success).not.toHaveBeenCalled()
    expect(asignarSegmentoDG).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
  })

  it('ignores a late search response once the query became too short', async () => {
    let responder: (v: unknown) => void = () => {}
    buscarPersonasParaDirectorGeneral.mockReturnValue(new Promise((resolve) => (responder = resolve)))
    montar()
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar director' })[0])
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar director general' })
    const buscador = within(dialogo).getByRole('searchbox', { name: 'Buscar persona' })

    await userEvent.type(buscador, 'luis')
    await waitFor(() => expect(buscarPersonasParaDirectorGeneral).toHaveBeenCalledWith('luis'))
    await userEvent.clear(buscador)
    await act(async () => responder({ success: true, data: [PERSONA] }))

    expect(within(dialogo).queryByRole('button', { name: /Luis Pérez/ })).not.toBeInTheDocument()
  })
})
