/**
 * The board's session draft (S24 of odd/tasks/planner-gdv.md; T5b; artboards
 * 01, 02, 05, 08; S2, S3, S4, S10, S11, S13–S15, S17, S22).
 *
 * Nothing is saved while the director works: "Ubicar" (the keyboard and touch
 * path), dragging, "Nuevo grupo", "Usar <localidad>" and deleting add a
 * pending change, and the board, the bank and the alerts show the result at
 * once. The header says "N cambios sin guardar" (the list, with "Quitar"),
 * "Descartar" and "Guardar", which sends every change in one
 * planner_guardar_cambios call; a refusal keeps the draft and points at the
 * failed change. "Deshacer" removes the last pending change, then undoes the
 * latest saved step. The spouse rule (S2), the scope (S10) and S22 stay
 * client-side; "Terminé mi segmento" waits for the segment's changes to be
 * saved; leaving the page with unsaved changes asks first.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { bancoDe, enGrupo, grupo, LOCALIDADES, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { EstadoPublicacion, GrupoTablero, PasoHistorial, SegmentoPublicacion, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn(), replace: jest.fn() }) }))

const acciones = {
  guardarCambiosAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
}
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  guardarCambiosAction: (...a: unknown[]) => acciones.guardarCambiosAction(...a),
  deshacerPasoAction: (...a: unknown[]) => acciones.deshacerPasoAction(...a),
  marcarSegmentoAction: (...a: unknown[]) => acciones.marcarSegmentoAction(...a),
}))

const PASO_OK = { ok: true, datos: { pasoId: 'p-nuevo', descripcion: 'movió a Ana', segmentosReabiertos: [] } }
const GUARDADO_OK = (n: number) => ({ ok: true, datos: { guardados: n, pasos: [], gruposCreados: {} } })

const TEMPORADA = {
  id: 't-2026-ii',
  nombre: '2026-II',
  fecha_inicio: '2026-10-12',
  fecha_fin: null,
  estado: 'planificacion',
  activa: false,
  cohorte: 'II' as const,
  origen_id: 't-2025-ii',
  origen_nombre: '2025 - II',
}

const HECTOR = { segmento_lider_id: 'sl-hector', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' }
const MARTA = { segmento_lider_id: 'sl-marta', usuario_id: 'u-marta', nombre: 'Marta', apellido: 'Rojas' }

const TORREALBA: GrupoTablero = grupo({
  grupo_id: 'g-torrealba',
  nombre: 'Grupo #9 Familia Torrealba',
  localidad_id: null,
  localidad_nombre: null,
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  capacidad_maxima: 16,
  directores: [HECTOR],
  lideres: [
    { ...enGrupo('l1'), nombre: 'José', apellido: 'Torrealba' },
    { ...enGrupo('l2'), nombre: 'Mariela', apellido: 'Torrealba' },
  ],
  aprendices: [{ ...enGrupo('a1'), nombre: 'Leonardo', apellido: 'Mujica' }],
  miembros: [{ ...enGrupo('pedro'), nombre: 'Pedro', apellido: 'Gil' }, enGrupo('m2'), enGrupo('m3')],
})

const VALIENTES: GrupoTablero = grupo({
  grupo_id: 'g-valientes',
  nombre: 'Mujeres Valientes',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  localidad_id: 'loc-bqto',
  localidad_nombre: 'Barquisimeto',
  localidad_municipio_id: 'mun-iri',
  localidad_municipio_nombre: 'Iribarren',
  capacidad_maxima: 14,
  lideres: [],
  aprendices: [enGrupo('a2')],
  miembros: [enGrupo('m4')],
})

const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }

const ANA = persona({ usuario_id: 'ana', nombre: 'Ana', apellido: 'Gil', genero: 'Femenino', conyuge_id: 'pedro', ...sinGrupo })
const CARLOS = persona({ usuario_id: 'c1', nombre: 'Carlos', apellido: 'Mendoza', genero: 'Masculino', conyuge_id: 'c2', ...sinGrupo })
const YELITZA = persona({ usuario_id: 'c2', nombre: 'Yelitza', apellido: 'Mendoza', genero: 'Femenino', conyuge_id: 'c1', ...sinGrupo })

const DIRECTOR_GENERAL: TemporadasPlanner = {
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: ['seg-mat', 'seg-muj'],
  segmentos: [
    { id: 'seg-mat', nombre: 'Matrimonios', directores: [HECTOR] },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [MARTA] },
  ],
  temporadas: [TEMPORADA],
}

const JOVENES = { id: 'seg-jov', nombre: 'Jóvenes', directores: [] }

const DIRECTOR_ETAPA: TemporadasPlanner = {
  ...DIRECTOR_GENERAL,
  usuario_id: 'u-etapa',
  ve_todos_los_segmentos: false,
  puede_publicar: false,
  puede_crear_temporada: false,
  segmentos_editables: ['seg-muj'],
  segmentos: [{ id: 'seg-muj', nombre: 'Mujeres +36', directores: [MARTA] }],
}

const segmento = (parcial: Partial<SegmentoPublicacion> & { id: string; nombre: string }): SegmentoPublicacion => ({
  grupos: 1,
  bloqueos: 0,
  terminado: false,
  marcado_por: null,
  marcado_en: null,
  ...parcial,
})

const estado = (segmentos: SegmentoPublicacion[]): EstadoPublicacion => ({
  temporada: { id: TEMPORADA.id, nombre: TEMPORADA.nombre, estado: 'planificacion', activa: false, cohorte: 'II' },
  bloqueos: { total: 0, sin_lider: 0, sin_director: 0, sin_localidad: 0, persona_en_dos_grupos: 0 },
  grupos: 2,
  segmentos,
  segmentos_con_grupos: 2,
  segmentos_terminados: 0,
  faltan_segmentos: 2,
  rol_puede_publicar: true,
  puede_publicar: false,
  origen: null,
  otras_activas: [],
})

const paso = (parcial: Partial<PasoHistorial> = {}): PasoHistorial => ({
  paso_id: 'p-1',
  numero: 1,
  accion: 'mover_personas',
  descripcion: 'movió a Ana Gil a Mujeres Valientes',
  creado_en: new Date(Date.now() - 90_000).toISOString(),
  actor_id: 'u-dg',
  actor_nombre: 'Rosa Díaz',
  segmentos: [],
  grupo_ids: [],
  usuario_ids: [],
  deshace_paso_id: null,
  deshecho_por: null,
  deshecho_por_nombre: null,
  puede_deshacer: true,
  motivo_no_deshacer: null,
  ...parcial,
})

const datos = (parcial: Partial<DatosPlanner> = {}): DatosPlanner => ({
  capacidades: DIRECTOR_GENERAL,
  temporada: TEMPORADA,
  grupos: [TORREALBA, VALIENTES],
  banco: bancoDe([TORREALBA, VALIENTES], [ANA, CARLOS, YELITZA, { ...persona({ usuario_id: 'pedro', nombre: 'Pedro', apellido: 'Gil', genero: 'Masculino', conyuge_id: 'ana' }), grupo_actual_id: 'g-torrealba', grupo_actual_nombre: 'Grupo #9 Familia Torrealba' }]),
  bloqueos: [],
  estado: estado([segmento({ id: 'seg-mat', nombre: 'Matrimonios' }), segmento({ id: 'seg-muj', nombre: 'Mujeres +36', bloqueos: 1 })]),
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

const banco = () => screen.getByRole('complementary', { name: 'Banco de personas' })
const tarjeta = (nombre: string) => screen.getByRole('article', { name: nombre })
const anuncio = () => screen.getByRole('status', { name: 'Cambios del planificador' })

async function abrirUbicar(nombreFila: string) {
  await userEvent.click(within(banco()).getByRole('button', { name: `Ubicar a ${nombreFila}` }))
  return screen.getByRole('dialog', { name: `Ubicar a ${nombreFila}` })
}

/** Clicks the header "Guardar" and returns the changes it sent. */
async function guardar() {
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(acciones.guardarCambiosAction).toHaveBeenCalled())
  const [{ temporadaId, cambios }] = acciones.guardarCambiosAction.mock.calls.at(-1) as [{ temporadaId: string; cambios: unknown[] }]
  expect(temporadaId).toBe('t-2026-ii')
  return cambios
}

const contador = (n: number) => screen.getByRole('button', { name: `${n} ${n === 1 ? 'cambio' : 'cambios'} sin guardar` })

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  acciones.deshacerPasoAction.mockResolvedValue(PASO_OK)
  acciones.marcarSegmentoAction.mockResolvedValue(PASO_OK)
  acciones.guardarCambiosAction.mockImplementation(async ({ cambios }: { cambios: unknown[] }) => GUARDADO_OK(cambios.length))
})

describe('Ubicar and the spouse rule (S2, S11)', () => {
  it('moves only the person into a non-Matrimonios group and says the spouse stays', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Ana Gil')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    expect(within(dialogo).getByText('Su esposo no viene: sigue en Grupo #9 Familia Torrealba')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(anuncio()).toHaveTextContent('Ana Gil en Mujeres Valientes')
    expect(await guardar()).toEqual([{ tipo: 'mover', usuarios: ['ana'], grupo: 'g-valientes', rol: 'miembro' }])
  })

  it('moves the couple together into Matrimonios, with the chosen role', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Carlos Mendoza y Yelitza Mendoza')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-torrealba')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Rol'), 'aprendiz')
    expect(within(dialogo).getByText('Van los dos: es un grupo de Matrimonios')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(await guardar()).toEqual([{ tipo: 'mover', usuarios: ['c1', 'c2'], grupo: 'g-torrealba', rol: 'aprendiz' }])
  })

  it('asks who goes when a couple row goes to a non-Matrimonios group', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Carlos Mendoza y Yelitza Mendoza')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Quién va?' })).getByRole('button', { name: 'Yelitza Mendoza' }))
    expect(within(dialogo).getByText('Su esposo no viene: está en el banco')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(await guardar()).toEqual([{ tipo: 'mover', usuarios: ['c2'], grupo: 'g-valientes', rol: 'miembro' }])
  })

  it('offers a director de etapa only the groups of their segments', async () => {
    render(<PlannerClient datos={datos({ capacidades: DIRECTOR_ETAPA })} pasos={[]} />)

    const dialogo = await abrirUbicar('Ana Gil')
    const opciones = within(within(dialogo).getByLabelText('Grupo')).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(opciones).toEqual(['', 'g-valientes'])
  })

  it('moves a member back to the bank from the expanded card', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '2 integrantes' }))
    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: 'Mover a m4 Pérez' }))
    const dialogo = screen.getByRole('dialog', { name: 'Mover a m4 Pérez' })
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'banco')
    expect(within(dialogo).queryByLabelText('Rol')).not.toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    expect(await guardar()).toEqual([{ tipo: 'mover', usuarios: ['m4'], grupo: null, rol: null }])
  })
})

describe('dragging (S9)', () => {
  it('drops a bank row on a card as Miembro and on a role zone of the expanded card with that role', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const fila = within(banco()).getByRole('button', { name: 'Ubicar a Ana Gil' }).closest('li') as HTMLElement
    fireEvent.dragStart(fila)
    fireEvent.dragOver(tarjeta('Mujeres Valientes'))
    fireEvent.drop(tarjeta('Mujeres Valientes'))
    expect(toast.info).toHaveBeenCalledWith('Su esposo no viene: sigue en Grupo #9 Familia Torrealba')
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '3 integrantes' })).toBeInTheDocument()
    expect(contador(1)).toBeInTheDocument()

    // Ana is on the card now; dragging her row onto the Líderes zone changes her role, still one pending move.
    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: /integrantes/ }))
    fireEvent.dragStart(within(tarjeta('Mujeres Valientes')).getByRole('listitem', { name: 'Ana Gil' }))
    fireEvent.drop(within(tarjeta('Mujeres Valientes')).getByRole('region', { name: 'Líderes' }))

    expect(contador(1)).toBeInTheDocument()
    expect(await guardar()).toEqual([{ tipo: 'mover', usuarios: ['ana'], grupo: 'g-valientes', rol: 'lider' }])
    expect(acciones.guardarCambiosAction).toHaveBeenCalledTimes(1)
  })
})

describe('the draft (S24)', () => {
  async function ubicar(nombreFila: string, grupoId: string, rol?: string) {
    const dialogo = await abrirUbicar(nombreFila)
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), grupoId)
    if (rol) await userEvent.selectOptions(within(dialogo).getByLabelText('Rol'), rol)
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))
  }

  it('shows a move at once, marks it unsaved and calls nobody until "Guardar"', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    expect(screen.getByText('Todo guardado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    await ubicar('Ana Gil', 'g-valientes')

    const valientes = tarjeta('Mujeres Valientes')
    expect(within(valientes).getByRole('button', { name: '3 integrantes' })).toBeInTheDocument()
    // The card and Ana's row in it.
    expect(within(valientes).getAllByText('Sin guardar')).toHaveLength(2)
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).queryByText('Sin guardar')).not.toBeInTheDocument()
    await userEvent.click(within(valientes).getByRole('button', { name: '3 integrantes' }))
    expect(within(within(valientes).getByRole('listitem', { name: 'Ana Gil' })).getByText('Sin guardar')).toBeInTheDocument()
    expect(contador(1)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    expect(acciones.guardarCambiosAction).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('lists the pending changes in order with counts per kind, and "Quitar" removes one', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')
    await ubicar('Carlos Mendoza y Yelitza Mendoza', 'g-torrealba')
    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' }))

    await userEvent.click(contador(3))
    const panel = screen.getByRole('dialog', { name: 'Cambios sin guardar' })
    expect(within(panel).getByText('2 movimientos · 1 edición')).toBeInTheDocument()
    const lista = within(panel).getByRole('list', { name: 'Cambios sin guardar' })
    expect(within(lista).getAllByRole('listitem').map((li) => within(li).getByTestId('descripcion').textContent)).toEqual([
      'Mover a Ana Gil a Mujeres Valientes como miembro',
      'Mover a Carlos y Yelitza Mendoza a Grupo #9 Familia Torrealba como miembros',
      'Cambiar localidad de Grupo #9 Familia Torrealba a Cabudare',
    ])

    await userEvent.click(within(lista).getByRole('button', { name: 'Quitar: Mover a Ana Gil a Mujeres Valientes como miembro' }))

    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.keyboard('{Escape}')
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '2 integrantes' })).toBeInTheDocument()
    expect(contador(2)).toBeInTheDocument()
  })

  it('refuses to remove a new group while a later change moves people into it', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Mujeres +36' }))
    const nuevo = screen.getByRole('dialog', { name: 'Nuevo grupo de Mujeres +36' })
    await userEvent.type(within(nuevo).getByLabelText('Nombre'), 'Rosas de Sarón')
    await userEvent.click(within(nuevo).getByRole('button', { name: 'Crear grupo' }))
    await ubicar('Ana Gil', 'tmp:g1')

    await userEvent.click(contador(2))
    const quitar = within(screen.getByRole('dialog', { name: 'Cambios sin guardar' })).getByRole('button', { name: 'Quitar: Crear grupo Rosas de Sarón' })
    expect(quitar).toHaveAttribute('aria-disabled', 'true')
    expect(quitar).toHaveAccessibleDescription('Primero quita «Mover a Ana Gil a Rosas de Sarón como miembro»: usa este grupo nuevo.')
    await userEvent.click(quitar)

    expect(toast.info).toHaveBeenCalledWith('Primero quita «Mover a Ana Gil a Rosas de Sarón como miembro»: usa este grupo nuevo.')
    expect(within(screen.getByRole('list', { name: 'Cambios sin guardar' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('"Descartar" asks, then puts the board back as saved', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    const confirmar = screen.getByRole('alertdialog', { name: '¿Descartar 1 cambio sin guardar?' })
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Descartar' }))

    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '2 integrantes' })).toBeInTheDocument()
    expect(screen.getByText('Todo guardado')).toBeInTheDocument()
    expect(acciones.guardarCambiosAction).not.toHaveBeenCalled()
  })

  it('"Guardar" sends every change in order, then clears the draft and refreshes', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')
    await ubicar('Carlos Mendoza y Yelitza Mendoza', 'g-torrealba', 'aprendiz')

    expect(await guardar()).toEqual([
      { tipo: 'mover', usuarios: ['ana'], grupo: 'g-valientes', rol: 'miembro' },
      { tipo: 'mover', usuarios: ['c1', 'c2'], grupo: 'g-torrealba', rol: 'aprendiz' },
    ])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Se guardaron 2 cambios'))
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByText('Todo guardado')).toBeInTheDocument()
    // Until the refreshed data arrives the saved changes stay on the board.
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '3 integrantes' })).toBeInTheDocument()
    expect(window.localStorage.getItem('planner-gdv:borrador:u-dg:t-2026-ii')).toBeNull()
  })

  it('keeps every change when the server refuses one, and points at it', async () => {
    acciones.guardarCambiosAction.mockResolvedValue({
      ok: false,
      codigo: '42501',
      indice: 1,
      mensaje: 'Cambio 2 de 3: No puedes mover personas a Grupo #9 Familia Torrealba: es de otro segmento (Matrimonios).',
    })
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')
    await ubicar('Carlos Mendoza y Yelitza Mendoza', 'g-torrealba')
    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' }))

    await guardar()

    const panel = await screen.findByRole('dialog', { name: 'Cambios sin guardar' })
    expect(within(panel).getByRole('alert')).toHaveTextContent('No se guardó ningún cambio.')
    const items = within(within(panel).getByRole('list', { name: 'Cambios sin guardar' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1]).toHaveAttribute('data-error', 'true')
    expect(items[1]).toHaveTextContent('Cambio 2 de 3: No puedes mover personas a Grupo #9 Familia Torrealba: es de otro segmento (Matrimonios).')
    expect(items[0]).not.toHaveAttribute('data-error')
    expect(toast.error).toHaveBeenCalledWith('Cambio 2 de 3: No puedes mover personas a Grupo #9 Familia Torrealba: es de otro segmento (Matrimonios).')
    expect(refresh).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(contador(3)).toBeInTheDocument()
  })

  it('keeps the draft when the database is missing the update', async () => {
    acciones.guardarCambiosAction.mockResolvedValue({ ok: false, codigo: 'PGRST202', indice: null, mensaje: 'Falta aplicar la actualización del planificador en la base de datos' })
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')

    await guardar()

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falta aplicar la actualización del planificador en la base de datos'))
    expect(contador(1)).toBeInTheDocument()
  })

  it('survives a reload: the draft is kept per user and season', async () => {
    const { unmount } = render(<PlannerClient datos={datos()} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')
    unmount()

    const otra = render(<PlannerClient datos={datos()} pasos={[]} />)
    expect(contador(1)).toBeInTheDocument()
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '3 integrantes' })).toBeInTheDocument()
    otra.unmount()

    render(<PlannerClient datos={datos({ temporada: { ...TEMPORADA, id: 't-otra' } })} pasos={[]} />)
    expect(screen.getByText('Todo guardado')).toBeInTheDocument()
  })

  it('asks before leaving the page only while there are unsaved changes', async () => {
    const agregar = jest.spyOn(window, 'addEventListener')
    const quitar = jest.spyOn(window, 'removeEventListener')
    render(<PlannerClient datos={datos()} pasos={[]} />)
    expect(agregar.mock.calls.filter(([tipo]) => tipo === 'beforeunload')).toHaveLength(0)

    await ubicar('Ana Gil', 'g-valientes')
    expect(agregar.mock.calls.filter(([tipo]) => tipo === 'beforeunload')).toHaveLength(1)
    const evento = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(true)

    await guardar()
    await waitFor(() => expect(quitar.mock.calls.filter(([tipo]) => tipo === 'beforeunload')).toHaveLength(1))
    agregar.mockRestore()
    quitar.mockRestore()
  })

  it('asks before switching season with unsaved changes', async () => {
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PlannerClient datos={datos({ capacidades: { ...DIRECTOR_GENERAL, temporadas: [TEMPORADA, { ...TEMPORADA, id: 't-2026-i', nombre: '2026-I' }] } })} pasos={[]} />)
    await ubicar('Ana Gil', 'g-valientes')

    await userEvent.click(screen.getByRole('button', { name: /cambiar de temporada/ }))
    await userEvent.click(screen.getByRole('link', { name: /2026-I\b(?!I)/ }))

    expect(confirmar).toHaveBeenCalledWith('Tienes 1 cambio sin guardar en 2026-II. Quedan en este navegador hasta que los guardes o descartes. ¿Cambiar de temporada?')
    confirmar.mockRestore()
  })
})

describe('Deshacer (S15, S24)', () => {
  it('removes the last pending change first, with Ctrl/Cmd+Z too, then undoes the latest saved step', async () => {
    render(<PlannerClient datos={datos()} pasos={[paso({ paso_id: 'p-mio' })]} />)
    const dialogo = await abrirUbicar('Ana Gil')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))
    const otro = await abrirUbicar('Carlos Mendoza y Yelitza Mendoza')
    await userEvent.selectOptions(within(otro).getByLabelText('Grupo'), 'g-torrealba')
    await userEvent.click(within(otro).getByRole('button', { name: 'Ubicar' }))

    const deshacer = screen.getByRole('button', { name: 'Deshacer' })
    expect(deshacer).toHaveAccessibleDescription('Quita: Mover a Carlos y Yelitza Mendoza a Grupo #9 Familia Torrealba como miembros')
    await userEvent.click(deshacer)
    expect(contador(1)).toBeInTheDocument()
    expect(anuncio()).toHaveTextContent('Quitaste: Mover a Carlos y Yelitza Mendoza a Grupo #9 Familia Torrealba como miembros')

    await userEvent.keyboard('{Control>}z{/Control}')
    expect(screen.getByText('Todo guardado')).toBeInTheDocument()
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '2 integrantes' })).toBeInTheDocument()
    expect(acciones.deshacerPasoAction).not.toHaveBeenCalled()

    const guardado = screen.getByRole('button', { name: 'Deshacer último guardado' })
    expect(guardado).toHaveAccessibleDescription('Deshace: movió a Ana Gil a Mujeres Valientes')
    await userEvent.click(guardado)
    expect(acciones.deshacerPasoAction).toHaveBeenCalledWith({ pasoId: 'p-mio' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('undoes the actor latest saved step that is not an undo', async () => {
    const pasos = [
      paso({ paso_id: 'p-otro', actor_id: 'u-otro', numero: 4 }),
      paso({ paso_id: 'p-deshacer', accion: 'deshacer', numero: 3 }),
      paso({ paso_id: 'p-deshecho', deshecho_por: 'p-deshacer', numero: 2 }),
      paso({ paso_id: 'p-mio', numero: 1 }),
    ]
    render(<PlannerClient datos={datos()} pasos={pasos} />)

    await userEvent.click(screen.getByRole('button', { name: 'Deshacer último guardado' }))

    expect(acciones.deshacerPasoAction).toHaveBeenCalledWith({ pasoId: 'p-mio' })
    await waitFor(() => expect(anuncio()).toHaveTextContent('Deshiciste: movió a Ana Gil a Mujeres Valientes'))
    expect(refresh).toHaveBeenCalled()
  })

  it('says why the latest saved step cannot be undone and does not call the server', async () => {
    const motivo = 'No se puede deshacer: después Héctor Linárez editó el grupo Mujeres Valientes'
    render(<PlannerClient datos={datos()} pasos={[paso({ puede_deshacer: false, motivo_no_deshacer: motivo })]} />)

    const boton = screen.getByRole('button', { name: 'Deshacer último guardado' })
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).toHaveAccessibleDescription(motivo)
    await userEvent.click(boton)

    expect(acciones.deshacerPasoAction).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(motivo)
  })

  it('shows the server refusal when undoing fails', async () => {
    acciones.deshacerPasoAction.mockResolvedValue({ ok: false, codigo: '40001', mensaje: 'No se puede deshacer: Ana ahora está en Grupo Rosas.' })
    render(<PlannerClient datos={datos()} pasos={[paso()]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Deshacer último guardado' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se puede deshacer: Ana ahora está en Grupo Rosas.'))
  })

  it('has nothing to undo without own steps', () => {
    render(<PlannerClient datos={datos()} pasos={[paso({ actor_id: 'u-otro' })]} />)

    expect(screen.getByRole('button', { name: 'Deshacer último guardado' })).toHaveAccessibleDescription('No tienes cambios para deshacer')
  })
})

describe('groups (S3, S4, S22)', () => {
  it('creates a group in the lane with the suggested name and the segment directors, as a pending change', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    expect(within(panel).getByText('Elige la localidad para sugerir un nombre')).toBeInTheDocument()
    await userEvent.selectOptions(within(panel).getByLabelText('Localidad'), 'loc-cab')
    await userEvent.click(within(panel).getByRole('button', { name: 'Usar sugerencia: Cabudare Matrimonios 1' }))
    expect(within(panel).getByLabelText('Nombre')).toHaveValue('Cabudare Matrimonios 1')
    expect(within(panel).getByText('Matrimonios · Cabudare')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Héctor Linárez' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Crear grupo' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })).not.toBeInTheDocument())
    const nuevo = tarjeta('Cabudare Matrimonios 1')
    expect(within(nuevo).getByText('Sin guardar')).toBeInTheDocument()
    expect(within(nuevo).getByText('Matrimonios · Cabudare')).toBeInTheDocument()
    expect(await guardar()).toEqual([
      {
        tipo: 'crear',
        clave: 'tmp:g1',
        datos: {
          nombre: 'Cabudare Matrimonios 1',
          segmento_id: 'seg-mat',
          localidad_id: 'loc-cab',
          dia_reunion: 'Jueves',
          hora_reunion: '19:30',
          capacidad_maxima: 12,
          director_etapa_ids: ['u-hector'],
        },
      },
    ])
  })

  it('offers every eligible director of the lane segment, a couple as one option', async () => {
    const luisa = { segmento_lider_id: 'sl-luisa', usuario_id: 'u-luisa', nombre: 'Luisa', apellido: 'Pérez' }
    const orlando = { segmento_lider_id: 'sl-orlando', usuario_id: 'u-orlando', nombre: 'Orlando', apellido: 'Pérez' }
    const ramon = { segmento_lider_id: 'sl-ramon', usuario_id: 'u-ramon', nombre: 'Ramón', apellido: 'Silva' }
    const capacidades = {
      ...DIRECTOR_GENERAL,
      segmentos: [{ id: 'seg-mat', nombre: 'Matrimonios', directores: [HECTOR, luisa, orlando, ramon] }, DIRECTOR_GENERAL.segmentos[1]],
    }
    const conyuges = [
      persona({ usuario_id: 'u-luisa', nombre: 'Luisa', apellido: 'Pérez', conyuge_id: 'u-orlando', ...sinGrupo }),
      persona({ usuario_id: 'u-orlando', nombre: 'Orlando', apellido: 'Pérez', conyuge_id: 'u-luisa', ...sinGrupo }),
    ]
    render(<PlannerClient datos={datos({ capacidades, banco: [...datos().banco, ...conyuges] })} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    const opciones = within(within(panel).getByRole('group', { name: 'Directores de etapa' })).getAllByRole('button')
    expect(opciones.map((o) => o.textContent)).toEqual(['Héctor Linárez', 'Luisa y Orlando Pérez', 'Ramón Silva'])
    expect(within(panel).queryByRole('button', { name: 'Marta Rojas' })).not.toBeInTheDocument()

    await userEvent.click(within(panel).getByRole('button', { name: 'Luisa y Orlando Pérez' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Ramón Silva' }))
    expect(within(panel).getByRole('button', { name: 'Luisa y Orlando Pérez' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(within(panel).getByLabelText('Nombre'), 'Rosas')
    await userEvent.click(within(panel).getByRole('button', { name: 'Crear grupo' }))

    expect(await guardar()).toEqual([
      { tipo: 'crear', clave: 'tmp:g1', datos: expect.objectContaining({ segmento_id: 'seg-mat', director_etapa_ids: ['u-luisa', 'u-orlando', 'u-ramon'] }) },
    ])
  })

  it('lists spouses individually when only one of them is eligible', async () => {
    const luisa = { segmento_lider_id: 'sl-luisa', usuario_id: 'u-luisa', nombre: 'Luisa', apellido: 'Pérez' }
    const capacidades = { ...DIRECTOR_GENERAL, segmentos: [{ id: 'seg-mat', nombre: 'Matrimonios', directores: [luisa] }, DIRECTOR_GENERAL.segmentos[1]] }
    const banco = [...datos().banco, persona({ usuario_id: 'u-luisa', nombre: 'Luisa', apellido: 'Pérez', conyuge_id: 'u-orlando', ...sinGrupo })]
    render(<PlannerClient datos={datos({ capacidades, banco })} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    expect(within(within(panel).getByRole('group', { name: 'Directores de etapa' })).getAllByRole('button').map((o) => o.textContent)).toEqual(['Luisa Pérez'])
  })

  it('says the segment has no directores de etapa yet', async () => {
    render(<PlannerClient datos={datos({ capacidades: { ...DIRECTOR_GENERAL, segmentos: [{ ...DIRECTOR_GENERAL.segmentos[0], directores: [] }, DIRECTOR_GENERAL.segmentos[1]] } })} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    expect(within(panel).queryByRole('group', { name: 'Directores de etapa' })).not.toBeInTheDocument()
    expect(within(panel).getByText('Matrimonios no tiene directores de etapa todavía; puedes asignarlo después.')).toBeInTheDocument()
  })

  it('keeps the form open when the name is already used in the segment, without a pending change', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    await userEvent.type(within(panel).getByLabelText('Nombre'), 'grupo #9  familia torrealba')
    await userEvent.click(within(panel).getByRole('button', { name: 'Crear grupo' }))

    expect(await within(panel).findByText('Ya hay un grupo llamado «grupo #9 familia torrealba» en Matrimonios.')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('moves people into a new group by its tmp key', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Mujeres +36' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Mujeres +36' })
    await userEvent.type(within(panel).getByLabelText('Nombre'), 'Rosas de Sarón')
    await userEvent.click(within(panel).getByRole('button', { name: 'Crear grupo' }))

    const dialogo = await abrirUbicar('Ana Gil')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'tmp:g1')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(within(tarjeta('Rosas de Sarón')).getByRole('button', { name: '1 integrante' })).toBeInTheDocument()
    expect((await guardar()).map((c) => (c as { tipo: string }).tipo)).toEqual(['crear', 'mover'])
    expect((acciones.guardarCambiosAction.mock.calls[0][0] as { cambios: unknown[] }).cambios[1]).toEqual({ tipo: 'mover', usuarios: ['ana'], grupo: 'tmp:g1', rol: 'miembro' })
  })

  it('applies the suggested localidad with "Usar <localidad>"', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' }))

    expect(within(tarjeta('Grupo #9 Familia Torrealba')).getByText('Matrimonios · Cabudare')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Matrimonios' })).getByRole('group', { name: 'Cabudare, 1 grupo' })).toBeInTheDocument()
    expect(await guardar()).toEqual([{ tipo: 'editar', grupo: 'g-torrealba', cambios: { localidad_id: 'loc-cab' } }])
  })

  it('deletes, after confirming, only a group that has not started', async () => {
    const iniciado = { ...VALIENTES, activo: true }
    render(<PlannerClient datos={datos({ grupos: [TORREALBA, iniciado] })} pasos={[]} />)

    // "Eliminar grupo" lives in the column's options menu ("⋮"), next to "Abrir".
    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: 'Opciones de Mujeres Valientes' }))
    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: 'Abrir Mujeres Valientes' })).toBeInTheDocument()
    expect(within(tarjeta('Mujeres Valientes')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Opciones de Grupo #9 Familia Torrealba' }))
    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Eliminar grupo' }))
    const confirmar = screen.getByRole('alertdialog', { name: '¿Eliminar Grupo #9 Familia Torrealba?' })
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Eliminar' }))

    expect(screen.queryByRole('article', { name: 'Grupo #9 Familia Torrealba' })).not.toBeInTheDocument()
    expect(await guardar()).toEqual([{ tipo: 'eliminar', grupo: 'g-torrealba' }])
  })

  it('keeps the group actions in the column options menu, which closes with Escape back on its button', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const opciones = within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Opciones de Grupo #9 Familia Torrealba' })
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
    await userEvent.click(opciones)
    expect(opciones).toHaveAttribute('aria-expanded', 'true')
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('list', { name: 'Opciones de Grupo #9 Familia Torrealba' })).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(opciones).toHaveAttribute('aria-expanded', 'false')
    expect(opciones).toHaveFocus()
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
  })

  it('does not delete a group whose cycle is active', async () => {
    render(<PlannerClient datos={datos({ grupos: [{ ...TORREALBA, estado_ciclo: 'activo' }, VALIENTES] })} pasos={[]} />)

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Opciones de Grupo #9 Familia Torrealba' }))
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
  })
})

describe('empty lanes (T5c)', () => {
  it('draws a lane for a segment without groups so the director general can create its first group', async () => {
    const capacidades = { ...DIRECTOR_GENERAL, segmentos_editables: [...DIRECTOR_GENERAL.segmentos_editables, 'seg-jov'], segmentos: [...DIRECTOR_GENERAL.segmentos, JOVENES] }
    const conJovenes = estado([segmento({ id: 'seg-mat', nombre: 'Matrimonios' }), segmento({ id: 'seg-muj', nombre: 'Mujeres +36' }), segmento({ id: 'seg-jov', nombre: 'Jóvenes', grupos: 0 })])
    render(<PlannerClient datos={datos({ capacidades, estado: conJovenes })} pasos={[]} />)

    const jovenes = screen.getByRole('region', { name: 'Jóvenes' })
    expect(within(jovenes).getByText('Todavía no hay grupos de Jóvenes en esta temporada.')).toBeInTheDocument()
    expect(within(jovenes).queryByRole('article')).not.toBeInTheDocument()
    expect(within(jovenes).queryByRole('button', { name: 'Terminé mi segmento' })).not.toBeInTheDocument()
    // "faltan" is the server's count (planner_estado_publicacion ignores segments without groups).
    expect(screen.getByRole('link', { name: 'Publicar · faltan 2 segmentos' })).toBeInTheDocument()
    await userEvent.click(within(jovenes).getByRole('button', { name: 'Nuevo grupo en Jóvenes' }))

    expect(screen.getByRole('dialog', { name: 'Nuevo grupo de Jóvenes' })).toBeInTheDocument()
  })

  it('draws the director de etapa own empty segment, never one of another director', () => {
    const capacidades = { ...DIRECTOR_ETAPA, segmentos_editables: ['seg-muj', 'seg-jov'], segmentos: [...DIRECTOR_ETAPA.segmentos, JOVENES] }
    render(<PlannerClient datos={datos({ capacidades, grupos: [VALIENTES] })} pasos={[]} />)

    expect(within(screen.getByRole('region', { name: 'Jóvenes' })).getByRole('button', { name: 'Nuevo grupo en Jóvenes' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Matrimonios' })).not.toBeInTheDocument()
  })

  it('hides empty lanes while searching', async () => {
    const capacidades = { ...DIRECTOR_GENERAL, segmentos_editables: [...DIRECTOR_GENERAL.segmentos_editables, 'seg-jov'], segmentos: [...DIRECTOR_GENERAL.segmentos, JOVENES] }
    render(<PlannerClient datos={datos({ capacidades })} pasos={[]} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar grupo, líder o persona' }), 'Valientes')

    expect(screen.queryByRole('region', { name: 'Jóvenes' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mujeres +36' })).toBeInTheDocument()
  })
})

describe('"Terminé mi segmento" (S14, S17)', () => {
  it('is disabled with the reason while the segment has blockers', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const mujeres = screen.getByRole('region', { name: 'Mujeres +36' })
    const boton = within(mujeres).getByRole('button', { name: 'Terminé mi segmento' })
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).toHaveAccessibleDescription('Primero resuelve el bloqueo')
    await userEvent.click(boton)
    expect(acciones.marcarSegmentoAction).not.toHaveBeenCalled()

    await userEvent.click(within(screen.getByRole('region', { name: 'Matrimonios' })).getByRole('button', { name: 'Terminé mi segmento' }))
    expect(acciones.marcarSegmentoAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', segmentoId: 'seg-mat', terminado: true })
  })

  it('shows who marked it and lets them unmark it', async () => {
    const marcado = segmento({ id: 'seg-mat', nombre: 'Matrimonios', terminado: true, marcado_por: { id: 'u-hector', nombre: 'Héctor Linárez' } })
    render(<PlannerClient datos={datos({ estado: estado([marcado]) })} pasos={[]} />)

    const matrimonios = screen.getByRole('region', { name: 'Matrimonios' })
    expect(within(matrimonios).getByText('Terminado por Héctor Linárez')).toBeInTheDocument()
    await userEvent.click(within(matrimonios).getByRole('button', { name: 'Desmarcar Matrimonios como terminado' }))

    expect(acciones.marcarSegmentoAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', segmentoId: 'seg-mat', terminado: false })
  })

  it('waits for the segment changes to be saved; marking itself saves at once', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' }))

    const boton = within(screen.getByRole('region', { name: 'Matrimonios' })).getByRole('button', { name: 'Terminé mi segmento' })
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).toHaveAccessibleDescription('Guarda tus cambios primero')
    await userEvent.click(boton)
    expect(acciones.marcarSegmentoAction).not.toHaveBeenCalled()

    await guardar()
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Matrimonios' })).getByRole('button', { name: 'Terminé mi segmento' })).not.toHaveAttribute('aria-disabled', 'true'))
    await userEvent.click(within(screen.getByRole('region', { name: 'Matrimonios' })).getByRole('button', { name: 'Terminé mi segmento' }))
    expect(acciones.marcarSegmentoAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', segmentoId: 'seg-mat', terminado: true })
  })

  it('is not offered on segments the actor does not edit', () => {
    render(<PlannerClient datos={datos({ capacidades: DIRECTOR_ETAPA, grupos: [VALIENTES] })} pasos={[]} />)

    expect(screen.queryByRole('region', { name: 'Matrimonios' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mujeres +36' })).getByRole('button', { name: 'Terminé mi segmento' })).toBeInTheDocument()
  })
})
