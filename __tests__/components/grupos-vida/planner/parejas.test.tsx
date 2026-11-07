/**
 * Full names and couples on the board (S23 of odd/tasks/planner-gdv.md).
 *
 * Names are never cut (no ellipsis) in the expanded card, the group panel,
 * the bank and the leaders line. Within one role the two spouses are one row
 * with both full names and ages and shared actions (Mover / Al banco send both
 * ids; the role stays per person in the panel). A spouse in another role of
 * the same group is a hint. In a Matrimonios group a person whose spouse is
 * not there is marked and counted on the compact card ("N sin su pareja");
 * outside Matrimonios nobody is (S2).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { enGrupo, grupo, LOCALIDADES, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { GrupoTablero, PersonaBanco, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))

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

const PASO_OK = { ok: true, datos: { pasoId: 'p-nuevo', descripcion: 'movió', segmentosReabiertos: [] } }

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

const quien = (usuario_id: string, nombre: string, apellido: string) => ({ ...enGrupo(usuario_id), nombre, apellido })

const LARGO = 'Artemio Jesús Gutiérrez Castellanos'

const CASTEJON: GrupoTablero = grupo({
  grupo_id: 'g-castejon',
  nombre: 'Grupo Castejón',
  lideres: [quien('juan', 'Juan', 'Castejón'), quien('erica', 'Érica', 'de Castejón')],
  aprendices: [quien('luis', 'Luis', 'Rivas')],
  miembros: [quien('pedro', 'Pedro', 'Gil'), quien('carla', 'Carla', 'Rivas'), quien('sofia', 'Sofía', 'Mora'), quien('raul', LARGO.split(' ')[0], LARGO.split(' ').slice(1).join(' '))],
})

const ROSAS: GrupoTablero = grupo({ grupo_id: 'g-rosas', nombre: 'Grupo Rosas', lideres: [quien('tomas', 'Tomás', 'Mora')] })

const VALIENTES: GrupoTablero = grupo({
  grupo_id: 'g-valientes',
  nombre: 'Mujeres Valientes',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  localidad_id: 'loc-bqto',
  localidad_nombre: 'Barquisimeto',
  localidad_municipio_id: 'mun-iri',
  localidad_municipio_nombre: 'Iribarren',
  lideres: [quien('elena', 'Elena', 'Ruiz')],
})

const en = (g: GrupoTablero) => ({ grupo_actual_id: g.grupo_id, grupo_actual_nombre: g.nombre, grupo_actual_segmento_id: g.segmento_id })
const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }

const BANCO: PersonaBanco[] = [
  persona({ usuario_id: 'juan', nombre: 'Juan', apellido: 'Castejón', edad: 41, genero: 'Masculino', conyuge_id: 'erica', ...en(CASTEJON) }),
  persona({ usuario_id: 'erica', nombre: 'Érica', apellido: 'de Castejón', edad: 39, genero: 'Femenino', conyuge_id: 'juan', ...en(CASTEJON) }),
  persona({ usuario_id: 'luis', nombre: 'Luis', apellido: 'Rivas', genero: 'Masculino', conyuge_id: 'carla', ...en(CASTEJON) }),
  persona({ usuario_id: 'carla', nombre: 'Carla', apellido: 'Rivas', genero: 'Femenino', conyuge_id: 'luis', ...en(CASTEJON) }),
  persona({ usuario_id: 'pedro', nombre: 'Pedro', apellido: 'Gil', genero: 'Masculino', conyuge_id: 'ana', ...en(CASTEJON) }),
  persona({ usuario_id: 'ana', nombre: 'Ana', apellido: 'Gil', genero: 'Femenino', conyuge_id: 'pedro', ...sinGrupo }),
  persona({ usuario_id: 'sofia', nombre: 'Sofía', apellido: 'Mora', genero: 'Femenino', conyuge_id: 'tomas', ...en(CASTEJON) }),
  persona({ usuario_id: 'tomas', nombre: 'Tomás', apellido: 'Mora', genero: 'Masculino', conyuge_id: 'sofia', ...en(ROSAS) }),
  persona({ usuario_id: 'raul', nombre: 'Artemio', apellido: 'Jesús Gutiérrez Castellanos', conyuge_id: null, ...en(CASTEJON) }),
  persona({ usuario_id: 'elena', nombre: 'Elena', apellido: 'Ruiz', genero: 'Femenino', conyuge_id: 'marco', ...en(VALIENTES) }),
  persona({ usuario_id: 'marco', nombre: 'Marco', apellido: 'Ruiz', genero: 'Masculino', conyuge_id: 'elena', ...sinGrupo }),
]

const DIRECTOR_GENERAL: TemporadasPlanner = {
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: ['seg-mat', 'seg-muj'],
  segmentos: [
    { id: 'seg-mat', nombre: 'Matrimonios', directores: [] },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [] },
  ],
  temporadas: [TEMPORADA],
}

const datos = (parcial: Partial<DatosPlanner> = {}): DatosPlanner => ({
  capacidades: DIRECTOR_GENERAL,
  temporada: TEMPORADA,
  grupos: [CASTEJON, ROSAS, VALIENTES],
  banco: BANCO,
  bloqueos: [],
  estado: null,
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

const PAREJA = 'Juan Castejón y Érica de Castejón'

const tarjeta = (nombre: string) => screen.getByRole('article', { name: nombre })
const alertas = (nombre: string) => within(tarjeta(nombre)).getByRole('list', { name: 'Alertas del grupo' })

async function expandir(nombre: string) {
  await userEvent.click(within(tarjeta(nombre)).getByRole('button', { name: /integrantes?$/ }))
  return tarjeta(nombre)
}

async function abrirPanel(nombre: string) {
  await userEvent.click(within(tarjeta(nombre)).getByRole('button', { name: `Abrir ${nombre}` }))
  return within(screen.getByRole('dialog', { name: nombre })).getByRole('region', { name: 'Integrantes' })
}

/** The element that shows the names of a member row: never cut. */
const nombres = (fila: HTMLElement) => fila.querySelector('[data-nombres]') as HTMLElement

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  Object.values(acciones).forEach((f) => f.mockResolvedValue(PASO_OK))
})

describe('full names (S23)', () => {
  it('never cuts the leaders line of the compact card', () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    expect(within(tarjeta('Grupo Castejón')).getByText(PAREJA, { selector: 'p:not([data-nombres])' })).not.toHaveClass('truncate')
  })

  it('never cuts a name in the expanded card, the panel or the bank', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const card = await expandir('Grupo Castejón')
    const filaCard = within(within(card).getByRole('region', { name: 'Miembros' })).getByRole('listitem', { name: LARGO })
    expect(nombres(filaCard)).toHaveTextContent(LARGO)
    expect(nombres(filaCard)).not.toHaveClass('truncate')

    const integrantes = await abrirPanel('Grupo Castejón')
    const filaPanel = within(integrantes).getByRole('listitem', { name: LARGO })
    expect(nombres(filaPanel)).toHaveTextContent(LARGO)
    expect(nombres(filaPanel)).not.toHaveClass('truncate')
  })

  it('keeps the bank names whole', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const banco = screen.getByRole('complementary', { name: 'Banco de personas' })
    await userEvent.click(within(banco).getByRole('button', { name: /^Sin ubicar/ }))
    const fila = within(banco).getByRole('button', { name: `Ubicar a ${LARGO}` }).closest('li') as HTMLElement
    expect(nombres(fila)).toHaveTextContent(LARGO)
    expect(nombres(fila)).not.toHaveClass('truncate')
  })
})

describe('couples together in the expanded card (S23)', () => {
  it('shows the two spouses of one role as one row with both names and ages', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const lideres = within(await expandir('Grupo Castejón')).getByRole('region', { name: 'Líderes' })
    const filas = within(lideres).getAllByRole('listitem')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveAccessibleName(PAREJA)
    expect(nombres(filas[0])).toHaveTextContent(/^Juan Castejón\s*41 y Érica de Castejón\s*39$/)
  })

  it('moves the couple with both ids', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const card = await expandir('Grupo Castejón')
    await userEvent.click(within(card).getByRole('button', { name: `Mover a ${PAREJA}` }))
    const dialogo = screen.getByRole('dialog', { name: `Mover a ${PAREJA}` })
    await userEvent.selectOptions(within(dialogo).getByLabelText('Grupo'), 'g-rosas')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    expect(acciones.moverPersonasAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['juan', 'erica'], grupoId: 'g-rosas', rol: 'lider' })
  })

  it('hints the spouse in another role of the same group', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const card = await expandir('Grupo Castejón')
    expect(within(within(card).getByRole('region', { name: 'Aprendiz' })).getByText('Esposa: Carla Rivas (Miembro)')).toBeInTheDocument()
    expect(within(within(card).getByRole('region', { name: 'Miembros' })).getByText('Esposo: Luis Rivas (Aprendiz)')).toBeInTheDocument()
  })
})

describe('missing spouse in Matrimonios (S23, S2)', () => {
  it('marks who has the spouse in the bank, in another group or not registered, and counts them on the card', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    expect(within(alertas('Grupo Castejón')).getByText('3 sin su pareja')).toBeInTheDocument()
    expect(within(alertas('Grupo Rosas')).getByText('1 sin su pareja')).toBeInTheDocument()

    const miembros = within(await expandir('Grupo Castejón')).getByRole('region', { name: 'Miembros' })
    expect(within(within(miembros).getByRole('listitem', { name: 'Pedro Gil' })).getByText('Su esposa está en el banco')).toBeInTheDocument()
    expect(within(within(miembros).getByRole('listitem', { name: 'Sofía Mora' })).getByText('Su esposo está en Grupo Rosas')).toBeInTheDocument()
    expect(within(within(miembros).getByRole('listitem', { name: LARGO })).getByText('Sin cónyuge registrado')).toBeInTheDocument()
  })

  it('marks nobody outside Matrimonios', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    expect(within(alertas('Mujeres Valientes')).queryByText(/sin su pareja/)).not.toBeInTheDocument()
    const card = await expandir('Mujeres Valientes')
    expect(within(card).queryByText(/Su esposo|Su esposa|Su cónyuge|Sin cónyuge/)).not.toBeInTheDocument()
  })
})

describe('couples in the group panel (S23)', () => {
  it('shows the couple as one row, keeps the role per person and shares Mover and Al banco', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const integrantes = await abrirPanel('Grupo Castejón')
    const lideres = within(integrantes).getByRole('region', { name: 'Líderes' })
    const filas = within(lideres).getAllByRole('listitem')
    expect(filas).toHaveLength(1)
    expect(filas[0]).toHaveAccessibleName(PAREJA)
    expect(nombres(filas[0])).toHaveTextContent(/^Juan Castejón\s*41 y Érica de Castejón\s*39$/)

    expect(within(filas[0]).getByLabelText('Rol de Juan Castejón')).toHaveValue('lider')
    await userEvent.click(within(filas[0]).getByRole('button', { name: `Devolver a ${PAREJA} al banco` }))
    expect(acciones.moverPersonasAction).toHaveBeenLastCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['juan', 'erica'], grupoId: null, rol: null })
  })

  it('changes the role of one spouse only', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const integrantes = await abrirPanel('Grupo Castejón')
    await userEvent.selectOptions(within(integrantes).getByLabelText('Rol de Érica de Castejón'), 'aprendiz')

    expect(acciones.moverPersonasAction).toHaveBeenLastCalledWith({ temporadaId: 't-2026-ii', usuarioIds: ['erica'], grupoId: 'g-castejon', rol: 'aprendiz' })
  })

  it('opens Mover for the couple and shows the missing-spouse markers', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)

    const integrantes = await abrirPanel('Grupo Castejón')
    expect(within(within(integrantes).getByRole('listitem', { name: 'Sofía Mora' })).getByText('Su esposo está en Grupo Rosas')).toBeInTheDocument()
    expect(within(within(integrantes).getByRole('listitem', { name: 'Luis Rivas' })).getByText('Esposa: Carla Rivas (Miembro)')).toBeInTheDocument()

    await userEvent.click(within(integrantes).getByRole('button', { name: `Mover a ${PAREJA}` }))
    expect(screen.getByRole('dialog', { name: `Mover a ${PAREJA}` })).toBeInTheDocument()
  })
})
