/**
 * The «Orden» tab of /dps/plan (odd/tasks/dps-asistencia-pco.md, T13, S10;
 * artboard docs/design-system/prototipos/planificacion-dps/02-plan-domingo-orden.html):
 * the tabs, the time columns per horario (pre servicio from the llegada),
 * the summary «termina …», inline edit of duración and título with Enter /
 * Esc and the invalid format, reorder with ↑ ↓ on the handle, add and
 * remove rows, the template of an empty order, «Copiar orden del domingo
 * anterior», the plan's own horarios in the sidebar (one evening service of
 * a Cena del Señor) and the read-only order. The server actions are mocked;
 * every name is fictitious.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlanClient, type PlanClientProps } from '@/components/dps/plan-client'
import * as accionesPlan from '@/lib/actions/dps-plan.actions'
import * as accionesOrden from '@/lib/actions/dps-orden.actions'
import { leerEquiposPlan, leerPlanCabecera, type PlanCabecera } from '@/lib/platform/dps/plan'
import { leerOrden, type FilaOrden } from '@/lib/platform/dps/orden'

jest.mock('@/lib/actions/dps-plan.actions', () => ({
  cargarEquiposDps: jest.fn(),
  buscarCandidatosDps: jest.fn(),
  convocarDps: jest.fn(),
  desconvocarDps: jest.fn(),
  planAnteriorDps: jest.fn(),
  copiarPlanDps: jest.fn(),
  cambiarPortadaDps: jest.fn(),
  quitarPortadaDps: jest.fn(),
}))
jest.mock('@/lib/actions/dps-orden.actions', () => ({
  cargarOrdenDps: jest.fn(),
  plantillaOrdenDps: jest.fn(),
  agregarFilaOrdenDps: jest.fn(),
  guardarFilaOrdenDps: jest.fn(),
  moverFilaOrdenDps: jest.fn(),
  quitarFilaOrdenDps: jest.fn(),
  copiarOrdenDps: jest.fn(),
  guardarHorariosDps: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dps/plan',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const anterior = mock(accionesPlan.planAnteriorDps)
const cargarOrden = mock(accionesOrden.cargarOrdenDps)
const plantilla = mock(accionesOrden.plantillaOrdenDps)
const agregar = mock(accionesOrden.agregarFilaOrdenDps)
const guardar = mock(accionesOrden.guardarFilaOrdenDps)
const mover = mock(accionesOrden.moverFilaOrdenDps)
const quitar = mock(accionesOrden.quitarFilaOrdenDps)
const copiarOrden = mock(accionesOrden.copiarOrdenDps)
const guardarHorarios = mock(accionesOrden.guardarHorariosDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const SERIE = { id: 's1', nombre: 'Tu casa tiene influencers', color: 'chart-1', imagen_path: null, semanas: 4 }
const plan = (parche: Record<string, unknown> = {}): PlanCabecera =>
  leerPlanCabecera({ id: 'plan8', fecha: '2026-11-08', tipo: 'domingo', titulo: null, semana: 3, serie: SERIE, horarios: ['09:15', '11:15'], llegada: '07:00', ...parche })!

const fila = (id: string, tipo: 'item' | 'encabezado', titulo: string, min: number, fase: string | null = null, parche: Record<string, unknown> = {}) => ({
  id,
  tipo,
  titulo,
  duracion_seg: min * 60,
  notas: null,
  responsable: null,
  fase,
  ...parche,
})
const ordenJson = (puedeEditar = true) => ({
  plan_id: 'plan8',
  puede_editar: puedeEditar,
  items: [
    fila('h-pre', 'encabezado', 'Pre servicio', 0, 'pre'),
    fila('montaje', 'item', 'Montaje', 45, null, { notas: 'Escenario y cámaras', responsable: 'Stage manager' }),
    fila('h-banda', 'encabezado', 'Banda', 0, 'servicio'),
    fila('hogar', 'item', 'Hogar (Sol)', 6),
    fila('ancla', 'item', 'Ancla del alma', 5),
    fila('h-post', 'encabezado', 'Post servicio', 0, 'post'),
    fila('salida', 'item', 'Salida', 5),
  ].map((f, posicion) => ({ ...f, posicion })),
})

const equiposJson = {
  plan_id: 'plan8',
  puede_editar: true,
  equipos: [{ equipo_id: 'audio', equipo: 'Audio', ruta: 'a', puestos: [{ puesto_id: 'foh', nombre: 'FOH', cantidad: 2, activo: true, convocados: [] }] }],
}

const props = (parche: Partial<PlanClientProps> = {}): PlanClientProps => ({
  plan: plan(),
  anterior: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }),
  siguiente: null,
  equipos: leerEquiposPlan(equiposJson),
  portadaUrl: null,
  motivo: null,
  error: null,
  orden: leerOrden(ordenJson()),
  vista: 'orden',
  ...parche,
})

const tabla = () => screen.getByRole('table', { name: 'Orden del servicio, domingo 8 de noviembre' })
const filaDe = (texto: string) => {
  const celda = within(tabla()).getByDisplayValue(texto)
  return celda.closest('tr') as HTMLElement
}
const celdas = (tr: HTMLElement) => within(tr).getAllByRole('cell').map((c) => c.textContent?.trim() ?? '')
const titulos = () => within(tabla()).getAllByRole('textbox', { name: /^Título/ }).map((i) => (i as HTMLInputElement).value)
const estado = () => screen.getByTestId('estado-guardado')
const aviso = () => screen.getByTestId('aviso-cambio')

const guardada = (f: Partial<FilaOrden> & { id: string }): FilaOrden => {
  const base = leerOrden(ordenJson()).filas.find((x) => x.id === f.id)!
  return { ...base, ...f }
}

beforeEach(() => {
  jest.clearAllMocks()
  guardar.mockImplementation(async (input) => ({
    ok: true,
    data: guardada({ id: input.itemId, titulo: input.titulo, duracionSeg: input.duracionSeg, notas: input.notas, responsable: input.responsable }),
  }))
  mover.mockImplementation(async (input) => ({ ok: true, data: { posicion: input.posicion } }))
  quitar.mockResolvedValue({ ok: true, data: { quitado: true } })
  cargarOrden.mockResolvedValue({ ok: true, data: leerOrden(ordenJson()) })
})

describe('the tabs', () => {
  it('opens on Orden with ?vista=orden and switches to Equipos in place, keeping the URL in step', async () => {
    const usuario = userEvent.setup()
    window.history.replaceState(null, '', '/dps/plan?plan=plan8&vista=orden')
    render(<PlanClient {...props()} />)
    const pestanas = screen.getByRole('navigation', { name: 'Secciones del plan' })
    expect(within(pestanas).getByRole('link', { name: 'Orden' })).toHaveAttribute('aria-current', 'page')
    expect(tabla()).toBeInTheDocument()
    await usuario.click(within(pestanas).getByRole('link', { name: 'Equipos' }))
    expect(within(pestanas).getByRole('link', { name: 'Equipos' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'Equipos del plan' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(window.location.search).toBe('?plan=plan8')
    await usuario.click(within(pestanas).getByRole('link', { name: 'Orden' }))
    expect(window.location.search).toBe('?plan=plan8&vista=orden')
    expect(within(pestanas).getByText('Ensayo').closest('[aria-disabled]')).toHaveTextContent('pronto')
  })
})

describe('the times', () => {
  it('shows one column per horario: pre servicio from the llegada once, the service at each start, post after each', () => {
    render(<PlanClient {...props()} />)
    expect(within(tabla()).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mover', '9:15', '11:15', 'Duración', 'Elemento y notas', 'Responsable'])
    expect(celdas(filaDe('Montaje')).slice(1, 3)).toEqual(['7:00', '—'])
    expect(celdas(filaDe('Hogar (Sol)')).slice(1, 3)).toEqual(['9:15', '11:15'])
    expect(celdas(filaDe('Ancla del alma')).slice(1, 3)).toEqual(['9:21', '11:21'])
    expect(celdas(filaDe('Salida')).slice(1, 3)).toEqual(['9:26', '11:26'])
    expect(within(filaDe('Montaje')).getByDisplayValue('Escenario y cámaras')).toBeInTheDocument()
    expect(within(filaDe('Montaje')).getByDisplayValue('Stage manager')).toBeInTheDocument()
    // The section header carries its total.
    expect(within(filaDe('Banda')).getByText('11:00')).toBeInTheDocument()
    expect(screen.getByTestId('resumen-orden')).toHaveTextContent('Servicio 11 min · termina 9:26 y 11:26')
  })

  it('lists the plan horarios in the sidebar, with the end of each service', () => {
    render(<PlanClient {...props()} />)
    const horarios = screen.getByRole('region', { name: 'Horarios' })
    expect(within(horarios).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Llegada del equipo7:00',
      'Servicio9:15 – 9:26',
      'Servicio11:15 – 11:26',
    ])
    expect(within(screen.getByRole('region', { name: 'Equipos' })).getByRole('button', { name: /^Audio/ })).toHaveTextContent('Audio0 convocados · 2 faltan')
  })

  it('warns when a service runs into the next one', () => {
    const largo = ordenJson()
    largo.items[3] = { ...largo.items[3]!, duracion_seg: 125 * 60 }
    render(<PlanClient {...props({ orden: leerOrden(largo) })} />)
    expect(screen.getByText('El servicio de las 9:15 termina a las 11:25, después del comienzo del de las 11:15.')).toBeInTheDocument()
  })
})

describe('inline edit', () => {
  it('saves a new duración on Enter and recalculates every time', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    const duracion = within(filaDe('Hogar (Sol)')).getByRole('textbox', { name: 'Duración de Hogar (Sol)' })
    expect(duracion).toHaveValue('6:00')
    await usuario.clear(duracion)
    await usuario.type(duracion, '8{Enter}')
    expect(celdas(filaDe('Ancla del alma')).slice(1, 3)).toEqual(['9:23', '11:23'])
    expect(duracion).toHaveValue('8:00')
    expect(aviso()).toHaveTextContent('Duración de Hogar (Sol): 8:00. Horas recalculadas.')
    await waitFor(() => expect(estado()).toHaveTextContent('Guardado'))
    expect(guardar).toHaveBeenCalledWith({ itemId: 'hogar', titulo: 'Hogar (Sol)', duracionSeg: 480, notas: null, responsable: null, fase: null })
  })

  it('keeps an invalid duración with the format in the live region, and Escape restores it', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    const duracion = within(filaDe('Hogar (Sol)')).getByRole('textbox', { name: 'Duración de Hogar (Sol)' })
    await usuario.clear(duracion)
    await usuario.type(duracion, '8:75{Enter}')
    expect(duracion).toHaveAttribute('aria-invalid', 'true')
    expect(aviso()).toHaveTextContent('Escribe la duración como minutos:segundos, por ejemplo 4:30.')
    expect(guardar).not.toHaveBeenCalled()
    await usuario.keyboard('{Escape}')
    expect(duracion).toHaveValue('6:00')
    expect(duracion).not.toHaveAttribute('aria-invalid')
  })

  it('saves the título when leaving the field and does nothing when unchanged', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    const titulo = within(filaDe('Ancla del alma')).getByRole('textbox', { name: 'Título de Ancla del alma' })
    await usuario.click(titulo)
    await usuario.tab()
    expect(guardar).not.toHaveBeenCalled()
    await usuario.clear(titulo)
    await usuario.type(titulo, 'Ancla del alma (Re)')
    fireEvent.blur(titulo)
    await waitFor(() => expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'ancla', titulo: 'Ancla del alma (Re)', duracionSeg: 300 })))
  })

  it('rolls a failed save back, says why and reloads the order', async () => {
    const usuario = userEvent.setup()
    guardar.mockResolvedValueOnce({ ok: false, message: 'Ese elemento ya no está en el orden. Actualiza la página.', codigo: 'item_invalido' })
    render(<PlanClient {...props()} />)
    const duracion = within(filaDe('Hogar (Sol)')).getByRole('textbox', { name: 'Duración de Hogar (Sol)' })
    await usuario.clear(duracion)
    await usuario.type(duracion, '9{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ese elemento ya no está en el orden. Actualiza la página.'))
    expect(estado()).toHaveTextContent('No se pudo guardar')
    expect(cargarOrden).toHaveBeenCalledWith({ planId: 'plan8' })
    await waitFor(() => expect(duracion).toHaveValue('6:00'))
  })
})

describe('reorder', () => {
  it('moves a row up with ↑ on its handle, announces its place and keeps the focus', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    const asa = screen.getByRole('button', { name: 'Mover Ancla del alma. Usa flechas arriba y abajo' })
    asa.focus()
    await usuario.keyboard('{ArrowUp}')
    expect(titulos()).toEqual(['Pre servicio', 'Montaje', 'Banda', 'Ancla del alma', 'Hogar (Sol)', 'Post servicio', 'Salida'])
    expect(aviso()).toHaveTextContent('Ancla del alma: posición 1 de 2 en Banda')
    expect(screen.getByRole('button', { name: 'Mover Ancla del alma. Usa flechas arriba y abajo' })).toHaveFocus()
    expect(mover).toHaveBeenCalledWith({ itemId: 'ancla', posicion: 3 })
    // Hogar now starts 5 minutes later.
    expect(celdas(filaDe('Hogar (Sol)')).slice(1, 3)).toEqual(['9:20', '11:20'])
  })

  it('moves down with ↓ across a header, and says when it is already first', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    screen.getByRole('button', { name: 'Mover Ancla del alma. Usa flechas arriba y abajo' }).focus()
    await usuario.keyboard('{ArrowDown}')
    expect(titulos()).toEqual(['Pre servicio', 'Montaje', 'Banda', 'Hogar (Sol)', 'Post servicio', 'Ancla del alma', 'Salida'])
    expect(aviso()).toHaveTextContent('Ancla del alma: posición 1 de 2 en Post servicio')
    expect(mover).toHaveBeenLastCalledWith({ itemId: 'ancla', posicion: 5 })
    screen.getByRole('button', { name: 'Mover Pre servicio. Usa flechas arriba y abajo' }).focus()
    await usuario.keyboard('{ArrowUp}')
    expect(aviso()).toHaveTextContent('Ya está primero en el orden.')
    expect(mover).toHaveBeenCalledTimes(1)
  })

  it('moves a row by dragging its handle onto another row', () => {
    render(<PlanClient {...props()} />)
    const datos = { effectAllowed: '', setDragImage: jest.fn() }
    fireEvent.dragStart(screen.getByRole('button', { name: 'Mover Salida. Usa flechas arriba y abajo' }), { dataTransfer: datos })
    fireEvent.dragOver(filaDe('Hogar (Sol)'), { dataTransfer: datos })
    fireEvent.drop(filaDe('Hogar (Sol)'), { dataTransfer: datos })
    expect(titulos()).toEqual(['Pre servicio', 'Montaje', 'Banda', 'Salida', 'Hogar (Sol)', 'Ancla del alma', 'Post servicio'])
    expect(mover).toHaveBeenCalledWith({ itemId: 'salida', posicion: 3 })
    expect(aviso()).toHaveTextContent('Salida: posición 1 de 3 en Banda')
  })

  it('reloads the order when a move fails', async () => {
    const usuario = userEvent.setup()
    mover.mockResolvedValueOnce({ ok: false, message: 'No se pudo mover el elemento. Actualiza la página.', codigo: 'posicion_invalida' })
    render(<PlanClient {...props()} />)
    screen.getByRole('button', { name: 'Mover Ancla del alma. Usa flechas arriba y abajo' }).focus()
    await usuario.keyboard('{ArrowUp}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo mover el elemento. Actualiza la página.'))
    await waitFor(() => expect(titulos()).toEqual(['Pre servicio', 'Montaje', 'Banda', 'Hogar (Sol)', 'Ancla del alma', 'Post servicio', 'Salida']))
  })
})

describe('add and remove', () => {
  it('adds an element before Post servicio and focuses its título with the text selected', async () => {
    const usuario = userEvent.setup()
    agregar.mockResolvedValueOnce({
      ok: true,
      data: { id: 'nuevo', posicion: 5, tipo: 'item', titulo: 'Nuevo elemento', duracionSeg: 120, notas: null, responsable: null, fase: null },
    })
    render(<PlanClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Elemento' }))
    expect(agregar).toHaveBeenCalledWith({ planId: 'plan8', tipo: 'item', titulo: 'Nuevo elemento', duracionSeg: 120, posicion: 5, fase: null })
    const titulo = await screen.findByDisplayValue('Nuevo elemento')
    expect(titulo).toHaveFocus()
    expect((titulo as HTMLInputElement).selectionStart).toBe(0)
    expect((titulo as HTMLInputElement).selectionEnd).toBe('Nuevo elemento'.length)
    expect(titulos()[5]).toBe('Nuevo elemento')
    expect(aviso()).toHaveTextContent('Agregaste un elemento al final de Banda.')
  })

  it('adds a header in the service before Post servicio', async () => {
    const usuario = userEvent.setup()
    agregar.mockResolvedValueOnce({
      ok: true,
      data: { id: 'h-nuevo', posicion: 5, tipo: 'encabezado', titulo: 'Nuevo encabezado', duracionSeg: 0, notas: null, responsable: null, fase: 'servicio' },
    })
    render(<PlanClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Encabezado' }))
    expect(agregar).toHaveBeenCalledWith({ planId: 'plan8', tipo: 'encabezado', titulo: 'Nuevo encabezado', duracionSeg: 0, posicion: 5, fase: 'servicio' })
    expect(await screen.findByDisplayValue('Nuevo encabezado')).toHaveFocus()
    expect(aviso()).toHaveTextContent('Agregaste un encabezado antes de Post servicio.')
  })

  it('removes a row at once', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Quitar Salida' }))
    expect(screen.queryByDisplayValue('Salida')).not.toBeInTheDocument()
    expect(quitar).toHaveBeenCalledWith({ itemId: 'salida' })
    expect(aviso()).toHaveTextContent('Quitaste Salida.')
  })

  it('changes when a header happens', async () => {
    const usuario = userEvent.setup()
    guardar.mockResolvedValueOnce({ ok: true, data: guardada({ id: 'h-post', fase: 'servicio' }) })
    render(<PlanClient {...props()} />)
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Momento de Post servicio' }), 'servicio')
    expect(guardar).toHaveBeenCalledWith({ itemId: 'h-post', titulo: 'Post servicio', duracionSeg: 0, notas: null, responsable: null, fase: 'servicio' })
    // Salida is now part of the service: the service is 16 minutes.
    expect(screen.getByTestId('resumen-orden')).toHaveTextContent('Servicio 16 min · termina 9:31 y 11:31')
  })
})

describe('an empty order', () => {
  it('starts from the template of the PDF', async () => {
    const usuario = userEvent.setup()
    plantilla.mockResolvedValueOnce({ ok: true, data: leerOrden(ordenJson()) })
    render(<PlanClient {...props({ orden: leerOrden({ plan_id: 'plan8', puede_editar: true, items: [] }) })} />)
    expect(screen.getByText('Este plan todavía no tiene orden')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Empezar con la plantilla' }))
    expect(plantilla).toHaveBeenCalledWith({ planId: 'plan8' })
    expect(await screen.findByDisplayValue('Montaje')).toBeInTheDocument()
  })

  it('reads as empty without actions for whoever does not plan', () => {
    render(<PlanClient {...props({ orden: leerOrden({ plan_id: 'plan8', puede_editar: false, items: [] }) })} />)
    expect(screen.getByText('Este plan todavía no tiene orden')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Empezar con la plantilla' })).not.toBeInTheDocument()
  })
})

describe('Copiar orden del domingo anterior', () => {
  it('confirms, replaces the current order and reloads it', async () => {
    const usuario = userEvent.setup()
    anterior.mockResolvedValueOnce({ ok: true, data: plan({ id: 'plan1', fecha: '2026-11-01', semana: 2 }) })
    copiarOrden.mockResolvedValueOnce({ ok: true, data: { copiados: 25 } })
    render(<PlanClient {...props()} />)
    await usuario.click(screen.getByRole('button', { name: 'Acciones' }))
    await usuario.click(await screen.findByRole('menuitem', { name: 'Copiar orden del domingo anterior' }))
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Copiar el orden del domingo 1 de noviembre?' })
    expect(dialogo).toHaveTextContent('Este plan ya tiene 7 filas en el orden. Se reemplazan por las del domingo 1 de noviembre.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Reemplazar' }))
    expect(copiarOrden).toHaveBeenCalledWith({ origenId: 'plan1', destinoId: 'plan8', reemplazar: true })
    await waitFor(() => expect(cargarOrden).toHaveBeenCalledWith({ planId: 'plan8' }))
    expect(toast.success).toHaveBeenCalledWith('Se copiaron 25 filas del orden.')
  })
})

describe('the horarios of the plan (S10)', () => {
  const cena = () =>
    props({
      plan: plan({ id: 'plan8', tipo: 'cena_del_senor', fecha: '2026-11-10', serie: null, semana: null, horarios: ['19:00'], llegada: '18:00' }),
      anterior: null,
    })

  it('times one evening service of a Cena del Señor', () => {
    render(<PlanClient {...cena()} />)
    expect(screen.getByRole('table', { name: 'Orden del servicio, martes 10 de noviembre' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Mover', '19:00', 'Duración', 'Elemento y notas', 'Responsable'])
    expect(screen.getByTestId('resumen-orden')).toHaveTextContent('Servicio 11 min · termina 19:11')
  })

  it('edits the services and the llegada, saves each change and updates the header', async () => {
    const usuario = userEvent.setup()
    guardarHorarios.mockImplementation(async (input) => ({ ok: true, data: plan({ ...cena().plan, horarios: [...input.horarios], llegada: input.llegada, tipo: 'cena_del_senor', fecha: '2026-11-10', serie: null, semana: null }) }))
    render(<PlanClient {...cena()} />)
    const horarios = screen.getByRole('region', { name: 'Horarios' })
    await usuario.click(within(horarios).getByRole('button', { name: 'Editar horarios' }))
    const servicio = within(horarios).getByLabelText('Servicio 1')
    fireEvent.change(servicio, { target: { value: '19:30' } })
    fireEvent.blur(servicio)
    await waitFor(() => expect(guardarHorarios).toHaveBeenCalledWith({ planId: 'plan8', horarios: ['19:30'], llegada: '18:00' }))
    expect(await screen.findByText('19:30 · llegada 18:00')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')[1]).toHaveTextContent('19:30')

    await usuario.click(within(horarios).getByRole('button', { name: 'Servicio' }))
    await waitFor(() => expect(guardarHorarios).toHaveBeenLastCalledWith({ planId: 'plan8', horarios: ['19:30', '21:30'], llegada: '18:00' }))
    await usuario.click(within(horarios).getByRole('button', { name: 'Quitar el servicio de las 21:30' }))
    await waitFor(() => expect(guardarHorarios).toHaveBeenLastCalledWith({ planId: 'plan8', horarios: ['19:30'], llegada: '18:00' }))
  })

  it('says what is wrong and saves nothing when the llegada is after the service', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...cena()} />)
    const horarios = screen.getByRole('region', { name: 'Horarios' })
    await usuario.click(within(horarios).getByRole('button', { name: 'Editar horarios' }))
    const llegada = within(horarios).getByLabelText('Llegada del equipo')
    fireEvent.change(llegada, { target: { value: '20:00' } })
    fireEvent.blur(llegada)
    expect(within(horarios).getByRole('alert')).toHaveTextContent('La llegada del equipo tiene que ser antes del primer servicio.')
    expect(guardarHorarios).not.toHaveBeenCalled()
  })
})

describe('the sidebar', () => {
  it('opens the Equipos tab from a team', async () => {
    const usuario = userEvent.setup()
    render(<PlanClient {...props()} />)
    await usuario.click(within(screen.getByRole('region', { name: 'Equipos' })).getByRole('button', { name: /^Audio/ }))
    expect(screen.getByRole('region', { name: 'Equipos del plan' })).toBeInTheDocument()
    expect(window.location.search).toBe('?plan=plan8')
  })
})

describe('read-only', () => {
  it('shows the same order and times without any control', () => {
    render(<PlanClient {...props({ orden: leerOrden(ordenJson(false)), equipos: leerEquiposPlan({ ...equiposJson, puede_editar: false }) })} />)
    const t = tabla()
    expect(within(t).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(t).queryByRole('button')).not.toBeInTheDocument()
    expect(within(t).getByText('Ancla del alma').closest('tr')).toHaveTextContent('9:21')
    expect(within(t).getByText('Escenario y cámaras')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Elemento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar horarios' })).not.toBeInTheDocument()
    expect(screen.getByText('Solo lectura: el plan lo arman la dirección de DPS y quienes ella agrega.')).toBeInTheDocument()
  })

  it('explains an order that could not be read', () => {
    render(<PlanClient {...props({ orden: null, ordenError: 'No se pudo cargar el plan. Actualiza la página.' })} />)
    expect(screen.getByText('No se pudo cargar el orden')).toBeInTheDocument()
    expect(screen.getByText('No se pudo cargar el plan. Actualiza la página.')).toBeInTheDocument()
  })
})
