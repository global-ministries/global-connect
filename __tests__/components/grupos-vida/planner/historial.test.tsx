/**
 * The history side panel (T8a of odd/tasks/planner-gdv.md; artboard 09;
 * S13, S15, S24), opened from "Historial" in the season header: the saved
 * steps of planner_historial newest first, grouped by day, each with its
 * actor, sentence, relative time, segment chips and "Deshecho por X"; filters
 * by director, segment and text; "Ver pasos anteriores" reads the next page
 * with p_antes; "Deshacer" on the steps the caller may undo (the director
 * general also on the directores de etapa's), the reason otherwise. With
 * unsaved board changes a saved step cannot be undone until they are saved
 * or discarded (the board would mix states).
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { agruparPorDia, filtrarPasos, tiempoPaso } from '@/components/grupos-vida/planner/modelo-historial'
import { bancoDe, enGrupo, grupo, LOCALIDADES } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import { claveBorrador, serializarBorrador } from '@/lib/platform/grupos-vida/planner/borrador'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { GrupoTablero, PasoHistorial, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

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
  cargarHistorialAction: jest.fn(),
}
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  guardarCambiosAction: (...a: unknown[]) => acciones.guardarCambiosAction(...a),
  deshacerPasoAction: (...a: unknown[]) => acciones.deshacerPasoAction(...a),
  marcarSegmentoAction: (...a: unknown[]) => acciones.marcarSegmentoAction(...a),
  cargarHistorialAction: (...a: unknown[]) => acciones.cargarHistorialAction(...a),
  cargarOrigenAction: jest.fn(() => Promise.resolve({ ok: true, origen: null, grupos: [] })),
}))

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

const TORREALBA: GrupoTablero = grupo({
  grupo_id: 'g-torrealba',
  nombre: 'Grupo #9 Familia Torrealba',
  lideres: [enGrupo('l1'), enGrupo('l2')],
  aprendices: [enGrupo('a1')],
  miembros: [enGrupo('m1'), enGrupo('m2'), enGrupo('m3')],
})

const VALIENTES: GrupoTablero = grupo({
  grupo_id: 'g-valientes',
  nombre: 'Mujeres Valientes',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  lideres: [enGrupo('l3')],
  miembros: [enGrupo('m4')],
})

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

const DIRECTOR_ETAPA: TemporadasPlanner = {
  ...DIRECTOR_GENERAL,
  usuario_id: 'u-gladys',
  ve_todos_los_segmentos: false,
  puede_publicar: false,
  puede_crear_temporada: false,
  segmentos_editables: ['seg-muj'],
  segmentos: [{ id: 'seg-muj', nombre: 'Mujeres +36', directores: [] }],
}

const datos = (parcial: Partial<DatosPlanner> = {}): DatosPlanner => ({
  capacidades: DIRECTOR_GENERAL,
  temporada: TEMPORADA,
  grupos: [TORREALBA, VALIENTES],
  banco: bancoDe([TORREALBA, VALIENTES]),
  bloqueos: [],
  estado: null,
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

const haceSegundos = (s: number): string => new Date(Date.now() - s * 1000).toISOString()

const paso = (parcial: Partial<PasoHistorial> = {}): PasoHistorial => ({
  paso_id: 'p-1',
  numero: 1,
  accion: 'mover_personas',
  descripcion: 'movió a Carlos Mendoza a Grupo #9 Familia Torrealba',
  creado_en: haceSegundos(40),
  actor_id: 'u-dg',
  actor_nombre: 'Morela Ocampo',
  segmentos: [{ id: 'seg-mat', nombre: 'Matrimonios' }],
  grupo_ids: ['g-torrealba'],
  usuario_ids: [],
  deshace_paso_id: null,
  deshecho_por: null,
  deshecho_por_nombre: null,
  puede_deshacer: true,
  motivo_no_deshacer: null,
  ...parcial,
})

const GLADYS = paso({
  paso_id: 'p-gladys',
  numero: 3,
  descripcion: 'cambió la reunión de Mujeres Valientes a jueves 7:00 p. m.',
  creado_en: haceSegundos(5),
  actor_id: 'u-gladys',
  actor_nombre: 'Gladys Suárez',
  segmentos: [{ id: 'seg-muj', nombre: 'Mujeres +36' }],
  grupo_ids: ['g-valientes'],
})
const MIO = paso({ paso_id: 'p-mio', numero: 2 })
const BLOQUEADO = paso({
  paso_id: 'p-bloqueado',
  numero: 1,
  descripcion: 'puso la localidad Barquisimeto en Grupo #9 Familia Torrealba',
  creado_en: haceSegundos(9 * 60),
  puede_deshacer: false,
  motivo_no_deshacer: 'No se puede deshacer: Héctor Linárez editó este grupo después',
})
const DESHECHO = paso({
  paso_id: 'p-deshecho',
  numero: 0,
  descripcion: 'movió a Wilmer Piñero a Grupo #9 Familia Torrealba',
  creado_en: haceSegundos(18 * 60),
  deshecho_por: 'p-x',
  deshecho_por_nombre: 'Héctor Linárez',
  puede_deshacer: false,
  motivo_no_deshacer: 'Este paso ya se deshizo',
})
const PASOS = [GLADYS, MIO, BLOQUEADO, DESHECHO]

async function abrirHistorial(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
  return screen.getByRole('dialog', { name: 'Historial de 2026-II' })
}

const filas = (panel: HTMLElement): HTMLElement[] => within(within(panel).getByRole('region', { name: 'Pasos guardados' })).getAllByRole('listitem')

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  acciones.deshacerPasoAction.mockResolvedValue({ ok: true, datos: { pasoId: 'p-nuevo', descripcion: 'deshizo', segmentosReabiertos: [] } })
})

describe('history panel', () => {
  it('opens from the season header and lists the steps newest first with actor, time, chips and state', async () => {
    render(<PlannerClient datos={datos()} pasos={PASOS} />)

    const historial = screen.getByRole('button', { name: 'Historial' })
    expect(historial).toHaveAttribute('aria-expanded', 'false')
    const panel = await abrirHistorial()
    expect(historial).toHaveAttribute('aria-expanded', 'true')

    expect(panel).toHaveTextContent('Ves los pasos de todos los directores')
    const [primero, segundo, tercero, cuarto] = filas(panel)
    expect(primero).toHaveTextContent('Gladys Suárez cambió la reunión de Mujeres Valientes a jueves 7:00 p. m.')
    expect(primero).toHaveTextContent(/hace \d+ s/)
    expect(within(primero).getByText('Mujeres +36')).toBeInTheDocument()
    expect(segundo).toHaveTextContent('Morela Ocampo movió a Carlos Mendoza a Grupo #9 Familia Torrealba')
    expect(segundo).toHaveTextContent(/Tú · hace \d+ s/)
    expect(tercero).toHaveTextContent(/hace 9 min/)
    expect(cuarto).toHaveTextContent('Deshecho por Héctor Linárez')
    expect(within(panel).getByRole('heading', { name: /^Hoy · / })).toBeInTheDocument()
  })

  it('lets the director general undo a director de etapa step, and refreshes (S15)', async () => {
    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    const panel = await abrirHistorial()

    await userEvent.click(within(filas(panel)[0]).getByRole('button', { name: 'Deshacer: cambió la reunión de Mujeres Valientes a jueves 7:00 p. m.' }))

    await waitFor(() => expect(acciones.deshacerPasoAction).toHaveBeenCalledWith({ pasoId: 'p-gladys' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(within(filas(panel)[0]).queryByRole('button', { name: /^Deshacer/ })).not.toBeInTheDocument())
  })

  it('shows the reason instead of "Deshacer" when a step can no longer be undone, and nothing on an undone one', async () => {
    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    const panel = await abrirHistorial()

    const bloqueado = filas(panel)[2]
    expect(within(bloqueado).queryByRole('button', { name: /^Deshacer/ })).not.toBeInTheDocument()
    expect(bloqueado).toHaveTextContent('No se puede deshacer: Héctor Linárez editó este grupo después')
    expect(within(filas(panel)[3]).queryByRole('button', { name: /^Deshacer/ })).not.toBeInTheDocument()
    expect(filas(panel)[3]).not.toHaveTextContent('Este paso ya se deshizo')
  })

  it('says the error when the undo is refused', async () => {
    acciones.deshacerPasoAction.mockResolvedValue({ ok: false, codigo: '40001', mensaje: 'No se puede deshacer: Ana ahora está en Grupo Rosas.' })
    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    const panel = await abrirHistorial()

    await userEvent.click(within(filas(panel)[1]).getByRole('button', { name: /^Deshacer: movió a Carlos/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se puede deshacer: Ana ahora está en Grupo Rosas.'))
    expect(within(filas(panel)[1]).getByRole('button', { name: /^Deshacer: movió a Carlos/ })).toBeInTheDocument()
  })

  it('tells a director de etapa they see their segments and undo their own steps', async () => {
    render(<PlannerClient datos={datos({ capacidades: DIRECTOR_ETAPA, grupos: [VALIENTES] })} pasos={[GLADYS]} />)
    const panel = await abrirHistorial()

    expect(panel).toHaveTextContent('Ves los pasos de tus segmentos')
    expect(filas(panel)[0]).toHaveTextContent(/Tú · hace \d+ s/)
  })

  it('filters by director, segment and text, and clears the filters', async () => {
    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    const panel = await abrirHistorial()

    const director = within(panel).getByRole('combobox', { name: 'Director' })
    expect(within(director).getByRole('option', { name: 'Tú · Morela Ocampo' })).toBeInTheDocument()
    await userEvent.selectOptions(director, 'u-gladys')
    expect(filas(panel)).toHaveLength(1)
    await userEvent.selectOptions(director, '')

    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Segmento' }), 'seg-mat')
    expect(filas(panel)).toHaveLength(3)

    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Buscar en el historial' }), 'wilmer')
    expect(filas(panel)).toHaveLength(1)
    expect(filas(panel)[0]).toHaveTextContent('Wilmer Piñero')

    await userEvent.type(within(panel).getByRole('searchbox', { name: 'Buscar en el historial' }), ' nadie')
    expect(within(panel).getByText('Ningún paso coincide')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Limpiar filtros' }))
    expect(filas(panel)).toHaveLength(4)
  })

  it('reads the previous steps with the date of the last one shown ("Ver pasos anteriores")', async () => {
    const muchos = Array.from({ length: 50 }, (_, i) => paso({ paso_id: `p-${i}`, numero: 100 - i, creado_en: haceSegundos(60 + i) }))
    const anterior = paso({ paso_id: 'p-viejo', numero: 1, descripcion: 'creó Grupo Renacer', creado_en: haceSegundos(3 * 60 * 60) })
    acciones.cargarHistorialAction.mockResolvedValue({ ok: true, datos: { pasos: [anterior], hayMas: false } })
    render(<PlannerClient datos={datos()} pasos={muchos} />)
    const panel = await abrirHistorial()

    await userEvent.click(within(panel).getByRole('button', { name: 'Ver pasos anteriores' }))

    expect(acciones.cargarHistorialAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii', antes: muchos[49].creado_en })
    await waitFor(() => expect(filas(panel)).toHaveLength(51))
    expect(filas(panel)[50]).toHaveTextContent('Morela Ocampo creó Grupo Renacer')
    expect(within(panel).queryByRole('button', { name: 'Ver pasos anteriores' })).not.toBeInTheDocument()
  })

  it('offers no "Ver pasos anteriores" when the first page was short, and says when the next page fails', async () => {
    const muchos = Array.from({ length: 50 }, (_, i) => paso({ paso_id: `p-${i}`, numero: 100 - i, creado_en: haceSegundos(60 + i) }))
    acciones.cargarHistorialAction.mockResolvedValue({ ok: false, codigo: 'XX000', mensaje: 'No se pudo leer el historial. Inténtalo de nuevo.' })
    const { unmount } = render(<PlannerClient datos={datos()} pasos={muchos} />)
    let panel = await abrirHistorial()

    await userEvent.click(within(panel).getByRole('button', { name: 'Ver pasos anteriores' }))
    expect(await within(panel).findByText('No se pudo leer el historial. Inténtalo de nuevo.')).toBeInTheDocument()
    unmount()

    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    panel = await abrirHistorial()
    expect(within(panel).queryByRole('button', { name: 'Ver pasos anteriores' })).not.toBeInTheDocument()
  })

  it('asks to save or discard the unsaved changes before undoing a saved step (S24)', async () => {
    const borrador = {
      siguiente: 2,
      cambios: [{ id: 'c1', descripcion: 'Mover a m1 al banco', segmentos: ['seg-mat'], cambio: { tipo: 'mover' as const, usuarios: ['m1'], grupo: null, rol: null } }],
    }
    window.localStorage.setItem(claveBorrador('u-dg', 't-2026-ii'), serializarBorrador(borrador, { usuarioId: 'u-dg', temporadaId: 't-2026-ii' }))
    acciones.guardarCambiosAction.mockResolvedValue({ ok: true, datos: { guardados: 1, pasos: [], gruposCreados: {} } })
    render(<PlannerClient datos={datos()} pasos={PASOS} />)
    const panel = await abrirHistorial()

    const nota = within(panel).getByRole('note')
    expect(nota).toHaveTextContent('Tienes 1 cambio sin guardar. Guárdalo o descártalo antes de deshacer un paso guardado')
    expect(nota).toHaveTextContent('el tablero mezclaría')
    const deshacer = within(filas(panel)[1]).getByRole('button', { name: /^Deshacer: movió a Carlos/ })
    expect(deshacer).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(deshacer)
    expect(acciones.deshacerPasoAction).not.toHaveBeenCalled()

    await userEvent.click(within(nota).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(acciones.guardarCambiosAction).toHaveBeenCalled())
  })

  it('says the history could not be read', async () => {
    render(<PlannerClient datos={datos()} pasos={null} />)
    const panel = await abrirHistorial()

    expect(panel).toHaveTextContent('No se pudo leer el historial. Recarga la página.')
  })

  it('says there are no saved steps yet', async () => {
    render(<PlannerClient datos={datos()} pasos={[]} />)
    const panel = await abrirHistorial()

    expect(panel).toHaveTextContent('Todavía no hay pasos guardados en 2026-II')
  })
})

describe('history model', () => {
  const AHORA = new Date('2026-11-07T15:00:00Z')

  it('says how long ago a step was saved, in Caracas time past a day', () => {
    expect(tiempoPaso('2026-11-07T14:59:55Z', AHORA)).toBe('hace 5 s')
    expect(tiempoPaso('2026-11-07T14:57:00Z', AHORA)).toBe('hace 3 min')
    expect(tiempoPaso('2026-11-07T12:00:00Z', AHORA)).toBe('hace 3 h')
    expect(tiempoPaso('2026-11-05T00:42:00Z', AHORA)).toMatch(/^8:42\s?p\.\s?m\.$/)
  })

  it('groups the steps by day in Caracas time', () => {
    const dias = agruparPorDia(
      [paso({ paso_id: 'a', creado_en: '2026-11-07T14:00:00Z' }), paso({ paso_id: 'b', creado_en: '2026-11-07T02:00:00Z' }), paso({ paso_id: 'c', creado_en: '2026-11-02T20:00:00Z' })],
      AHORA,
    )

    expect(dias.map((d) => [d.titulo, d.pasos.map((p) => p.paso_id)])).toEqual([
      ['Hoy · 7 nov', ['a']],
      ['Ayer · 6 nov', ['b']],
      ['2 nov', ['c']],
    ])
  })

  it('filters by actor, segment and text without accents', () => {
    const pasos = [GLADYS, MIO]
    expect(filtrarPasos(pasos, { actor: 'u-gladys', segmento: '', texto: '' })).toEqual([GLADYS])
    expect(filtrarPasos(pasos, { actor: '', segmento: 'seg-mat', texto: '' })).toEqual([MIO])
    expect(filtrarPasos(pasos, { actor: '', segmento: '', texto: 'SUAREZ' })).toEqual([GLADYS])
  })
})
