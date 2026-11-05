/**
 * The board's saved steps (T5b of odd/tasks/planner-gdv.md; artboards 01, 02,
 * 05, 08; S2, S3, S4, S10, S11, S13–S15, S17, S22).
 *
 * "Ubicar" (the keyboard and touch path) and dragging send one
 * planner_mover_personas step with the spouse rule: into Matrimonios the
 * couple, elsewhere only the person and the note of who stays. The move shows
 * at once and rolls back on error, with the server's message. The header's
 * save state and "Deshacer" (the actor's latest step, or why not). "Nuevo
 * grupo" with the name suggestion, "Usar <localidad>", deleting only groups
 * that have not started, and "Terminé mi segmento" disabled until 0 blockers.
 */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  moverPersonasAction: jest.fn(),
  crearGrupoAction: jest.fn(),
  editarGrupoAction: jest.fn(),
  eliminarGrupoAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
}
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  moverPersonasAction: (...a: unknown[]) => acciones.moverPersonasAction(...a),
  crearGrupoAction: (...a: unknown[]) => acciones.crearGrupoAction(...a),
  editarGrupoAction: (...a: unknown[]) => acciones.editarGrupoAction(...a),
  eliminarGrupoAction: (...a: unknown[]) => acciones.eliminarGrupoAction(...a),
  deshacerPasoAction: (...a: unknown[]) => acciones.deshacerPasoAction(...a),
  marcarSegmentoAction: (...a: unknown[]) => acciones.marcarSegmentoAction(...a),
}))

const PASO_OK = { ok: true, datos: { pasoId: 'p-nuevo', descripcion: 'movió a Ana', segmentosReabiertos: [] } }

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
    { id: 'seg-mat', nombre: 'Matrimonios' },
    { id: 'seg-muj', nombre: 'Mujeres +36' },
  ],
  temporadas: [TEMPORADA],
}

const DIRECTOR_ETAPA: TemporadasPlanner = {
  ...DIRECTOR_GENERAL,
  usuario_id: 'u-etapa',
  ve_todos_los_segmentos: false,
  puede_publicar: false,
  puede_crear_temporada: false,
  segmentos_editables: ['seg-muj'],
  segmentos: [{ id: 'seg-muj', nombre: 'Mujeres +36' }],
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

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  Object.values(acciones).forEach((f) => f.mockResolvedValue(PASO_OK))
})

describe('Ubicar and the spouse rule (S2, S11)', () => {
  it('moves only the person into a non-Matrimonios group and says the spouse stays', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Ana Gil')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    expect(within(dialogo).getByText('Su esposo no viene: sigue en Grupo #9 Familia Torrealba')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['ana'], grupoId: 'g-valientes', rol: 'miembro' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(anuncio()).toHaveTextContent('Ana Gil en Mujeres Valientes')
  })

  it('moves the couple together into Matrimonios, with the chosen role', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Carlos Mendoza y Yelitza Mendoza')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-torrealba')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Rol'), 'aprendiz')
    expect(within(dialogo).getByText('Van los dos: es un grupo de Matrimonios')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['c1', 'c2'], grupoId: 'g-torrealba', rol: 'aprendiz' })
  })

  it('asks who goes when a couple row goes to a non-Matrimonios group', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Carlos Mendoza y Yelitza Mendoza')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    await userEvent.click(within(within(dialogo).getByRole('group', { name: '¿Quién va?' })).getByRole('button', { name: 'Yelitza Mendoza' }))
    expect(within(dialogo).getByText('Su esposo no viene: está en el banco')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['c2'], grupoId: 'g-valientes', rol: 'miembro' })
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

    expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['m4'], grupoId: null, rol: null })
  })
})

describe('dragging (S9)', () => {
  it('drops a bank row on a card as Miembro and on a role zone of the expanded card with that role', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const fila = within(banco()).getByRole('button', { name: 'Ubicar a Ana Gil' }).closest('li') as HTMLElement
    fireEvent.dragStart(fila)
    fireEvent.dragOver(tarjeta('Mujeres Valientes'))
    fireEvent.drop(tarjeta('Mujeres Valientes'))
    await waitFor(() =>
      expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['ana'], grupoId: 'g-valientes', rol: 'miembro' }),
    )
    expect(toast.info).toHaveBeenCalledWith('Su esposo no viene: sigue en Grupo #9 Familia Torrealba')

    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: /integrantes/ }))
    fireEvent.dragStart(within(banco()).getByRole('button', { name: 'Ubicar a Ana Gil' }).closest('li') as HTMLElement)
    fireEvent.drop(within(tarjeta('Mujeres Valientes')).getByRole('region', { name: 'Líderes' }))
    await waitFor(() =>
      expect(acciones.moverPersonasAction).toHaveBeenLastCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['ana'], grupoId: 'g-valientes', rol: 'lider' }),
    )
  })
})

describe('optimistic move and rollback (S13)', () => {
  it('shows the move at once, then rolls it back with the server message', async () => {
    let responder: (valor: unknown) => void = () => undefined
    acciones.moverPersonasAction.mockReturnValue(new Promise((r) => (responder = r)))
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const dialogo = await abrirUbicar('Ana Gil')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-valientes')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ubicar' }))

    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '3 integrantes' })).toBeInTheDocument()
    expect(screen.getByText('Guardando…')).toBeInTheDocument()

    await act(async () => responder({ ok: false, codigo: '42501', mensaje: 'No puedes mover personas a Mujeres Valientes: es de otro segmento (Mujeres +36).' }))

    expect(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: '2 integrantes' })).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('No puedes mover personas a Mujeres Valientes: es de otro segmento (Mujeres +36).')
    expect(screen.getByText('No se guardó')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('save state and Deshacer (S13, S15)', () => {
  it('undoes the actor latest step that is not an undo', async () => {
    const pasos = [
      paso({ paso_id: 'p-otro', actor_id: 'u-otro', numero: 4 }),
      paso({ paso_id: 'p-deshacer', accion: 'deshacer', numero: 3 }),
      paso({ paso_id: 'p-deshecho', deshecho_por: 'p-deshacer', numero: 2 }),
      paso({ paso_id: 'p-mio', numero: 1 }),
    ]
    render(<PlannerClient datos={datos()} pasos={pasos} />)

    expect(screen.getByText(/^Guardado · hace 1 min$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

    expect(acciones.deshacerPasoAction).toHaveBeenCalledWith({ pasoId: 'p-mio' })
    await waitFor(() => expect(anuncio()).toHaveTextContent('Deshiciste: movió a Ana Gil a Mujeres Valientes'))
    expect(refresh).toHaveBeenCalled()
  })

  it('says why the latest step cannot be undone and does not call the server', async () => {
    const motivo = 'No se puede deshacer: después Héctor Linárez editó el grupo Mujeres Valientes'
    render(<PlannerClient datos={datos()} pasos={[paso({ puede_deshacer: false, motivo_no_deshacer: motivo })]} />)

    const boton = screen.getByRole('button', { name: 'Deshacer' })
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(boton).toHaveAccessibleDescription(motivo)
    await userEvent.click(boton)

    expect(acciones.deshacerPasoAction).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith(motivo)
  })

  it('shows the server refusal when undoing fails', async () => {
    acciones.deshacerPasoAction.mockResolvedValue({ ok: false, codigo: '40001', mensaje: 'No se puede deshacer: Ana ahora está en Grupo Rosas.' })
    render(<PlannerClient datos={datos()} pasos={[paso()]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se puede deshacer: Ana ahora está en Grupo Rosas.'))
  })

  it('has nothing to undo without own steps', () => {
    render(<PlannerClient datos={datos()} pasos={[paso({ actor_id: 'u-otro' })]} />)

    expect(screen.getByRole('button', { name: 'Deshacer' })).toHaveAccessibleDescription('No tienes cambios para deshacer')
  })
})

describe('groups (S3, S4, S22)', () => {
  it('creates a group in the lane with the suggested name and the segment directors', async () => {
    acciones.crearGrupoAction.mockResolvedValue({ ok: true, datos: { ...PASO_OK.datos, grupoId: 'g-nuevo' } })
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

    expect(acciones.crearGrupoAction).toHaveBeenCalledWith({
      temporadaId: 't-2026-ii',
      datos: {
        nombre: 'Cabudare Matrimonios 1',
        segmento_id: 'seg-mat',
        localidad_id: 'loc-cab',
        dia_reunion: 'Jueves',
        hora_reunion: '19:30',
        capacidad_maxima: 12,
        director_etapa_ids: ['u-hector'],
      },
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })).not.toBeInTheDocument())
  })

  it('keeps the form open with the server message when creating fails', async () => {
    acciones.crearGrupoAction.mockResolvedValue({ ok: false, codigo: '22023', mensaje: 'Ya existe un grupo llamado «Rosas» en Matrimonios en esta temporada.' })
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo grupo en Matrimonios' }))
    const panel = screen.getByRole('dialog', { name: 'Nuevo grupo de Matrimonios' })
    await userEvent.type(within(panel).getByLabelText('Nombre'), 'Rosas')
    await userEvent.click(within(panel).getByRole('button', { name: 'Crear grupo' }))

    expect(await within(panel).findByText('Ya existe un grupo llamado «Rosas» en Matrimonios en esta temporada.')).toBeInTheDocument()
  })

  it('applies the suggested localidad with "Usar <localidad>"', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' }))

    expect(acciones.editarGrupoAction).toHaveBeenCalledWith({ grupoId: 'g-torrealba', cambios: { localidad_id: 'loc-cab' } })
  })

  it('deletes, after confirming, only a group that has not started', async () => {
    const iniciado = { ...VALIENTES, activo: true }
    render(<PlannerClient datos={datos({ grupos: [TORREALBA, iniciado] })} pasos={[]} />)

    await userEvent.click(within(tarjeta('Mujeres Valientes')).getByRole('button', { name: /integrantes/ }))
    expect(within(tarjeta('Mujeres Valientes')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: /integrantes/ }))
    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: 'Eliminar grupo' }))
    const confirmar = screen.getByRole('alertdialog', { name: '¿Eliminar Grupo #9 Familia Torrealba?' })
    await userEvent.click(within(confirmar).getByRole('button', { name: 'Eliminar' }))

    expect(acciones.eliminarGrupoAction).toHaveBeenCalledWith({ grupoId: 'g-torrealba' })
  })

  it('does not delete a group whose cycle is active', async () => {
    render(<PlannerClient datos={datos({ grupos: [{ ...TORREALBA, estado_ciclo: 'activo' }, VALIENTES] })} pasos={[]} />)

    await userEvent.click(within(tarjeta('Grupo #9 Familia Torrealba')).getByRole('button', { name: /integrantes/ }))
    expect(within(tarjeta('Grupo #9 Familia Torrealba')).queryByRole('button', { name: 'Eliminar grupo' })).not.toBeInTheDocument()
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

  it('is not offered on segments the actor does not edit', () => {
    render(<PlannerClient datos={datos({ capacidades: DIRECTOR_ETAPA, grupos: [VALIENTES] })} pasos={[]} />)

    expect(screen.queryByRole('region', { name: 'Matrimonios' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mujeres +36' })).getByRole('button', { name: 'Terminé mi segmento' })).toBeInTheDocument()
  })
})
