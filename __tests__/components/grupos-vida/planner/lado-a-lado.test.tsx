/**
 * The Lado a lado view (T7 of odd/tasks/planner-gdv.md; artboard 07; S9, S21,
 * S24; S2, S10, S23).
 *
 * Mode "<origen> con <destino>": a group of the origin season (read-only,
 * loaded on entering the view with cargarOrigenAction) next to a group of
 * the season in planning. Each origin person or couple says "Ya en <grupo>"
 * or "Sin ubicar"; "Pasar" and "Pasar las N sin ubicar" add moves to the
 * session draft keeping the role (Líder → lider, Colíder → aprendiz,
 * Miembro → miembro) and the spouse rule (S2); "Crear grupo copiando este"
 * adds the group and its leaders. Mode "Dos grupos de <destino>" moves people
 * between two groups of the season. Nothing is saved (S24); the draft is read
 * back from localStorage. A director de etapa only sees their segments (S10).
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { bancoDe, enGrupo, grupo, LOCALIDADES, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { GrupoTablero, PersonaBanco, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'
import type { CambioPlanner } from '@/lib/platform/grupos-vida/planner/acciones'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))

const acciones = {
  guardarCambiosAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
  cargarOrigenAction: jest.fn(),
}
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  guardarCambiosAction: (...a: unknown[]) => acciones.guardarCambiosAction(...a),
  deshacerPasoAction: (...a: unknown[]) => acciones.deshacerPasoAction(...a),
  marcarSegmentoAction: (...a: unknown[]) => acciones.marcarSegmentoAction(...a),
  cargarOrigenAction: (...a: unknown[]) => acciones.cargarOrigenAction(...a),
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

const HECTOR = { segmento_lider_id: 'sl-hector', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' }
const PABLO = { segmento_lider_id: 'sl-pablo', usuario_id: 'u-pablo', nombre: 'Pablo', apellido: 'Viejo' }
const MARTA = { segmento_lider_id: 'sl-marta', usuario_id: 'u-marta', nombre: 'Marta', apellido: 'Rojas' }

const p = (usuario_id: string, nombre: string, apellido: string) => ({ ...enGrupo(usuario_id), nombre, apellido })

// ─── 2026-II (the season in planning) ───

const ESCALONA: GrupoTablero = grupo({
  grupo_id: 'g-escalona',
  nombre: 'Grupo #14 Los Escalona',
  directores: [HECTOR],
  lideres: [p('rafael', 'Rafael', 'Escalona'), p('rosa', 'Rosa', 'Escalona')],
  miembros: [p('douglas', 'Douglas', 'Paz')],
})

const ROSAS: GrupoTablero = grupo({
  grupo_id: 'g-rosas',
  nombre: 'Las Rosas',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  directores: [MARTA],
  lideres: [p('lucia', 'Lucía', 'Pérez')],
})

// ─── 2025 - II (the origin, read-only) ───

const O_SILVA: GrupoTablero = grupo({
  grupo_id: 'o-silva',
  nombre: 'Cabudare Matrimonios 2',
  lideres: [p('rafael', 'Rafael', 'Escalona'), p('rosa', 'Rosa', 'Escalona')],
  aprendices: [p('frank', 'Frank', 'Tovar')],
  miembros: [p('c1', 'Carlos', 'Mendoza'), p('c2', 'Yelitza', 'Mendoza'), p('nora', 'Nora', 'Rondón'), p('douglas', 'Douglas', 'Paz')],
})

const O_TORRES: GrupoTablero = grupo({
  grupo_id: 'o-torres',
  nombre: 'Grupo Los Torres',
  localidad_id: 'loc-cab',
  localidad_nombre: 'Cabudare',
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  capacidad_maxima: 14,
  directores: [HECTOR, PABLO],
  lideres: [p('tomas', 'Tomás', 'Torres'), p('tania', 'Tania', 'Torres')],
  miembros: [p('ines', 'Inés', 'Gil')],
})

const O_FE: GrupoTablero = grupo({
  grupo_id: 'o-fe',
  nombre: 'Mujeres de Fe',
  segmento_id: 'seg-muj',
  segmento_nombre: 'Mujeres +36',
  lideres: [p('yaneth', 'Yaneth', 'Rodríguez')],
  miembros: [p('nelly', 'Nelly', 'Castillo')],
})

const sinGrupo = { grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }
const de = (origen: GrupoTablero, rol: string) => ({ origen_grupo_id: origen.grupo_id, origen_grupo_nombre: origen.nombre, origen_rol: rol })

const SIN_UBICAR: PersonaBanco[] = [
  persona({ usuario_id: 'frank', nombre: 'Frank', apellido: 'Tovar', ...sinGrupo, ...de(O_SILVA, 'Colíder') }),
  persona({ usuario_id: 'c1', nombre: 'Carlos', apellido: 'Mendoza', genero: 'Masculino', conyuge_id: 'c2', ...sinGrupo, ...de(O_SILVA, 'Miembro') }),
  persona({ usuario_id: 'c2', nombre: 'Yelitza', apellido: 'Mendoza', genero: 'Femenino', conyuge_id: 'c1', ...sinGrupo, ...de(O_SILVA, 'Miembro') }),
  persona({ usuario_id: 'nora', nombre: 'Nora', apellido: 'Rondón', ...sinGrupo, ...de(O_SILVA, 'Miembro') }),
  persona({ usuario_id: 'tomas', nombre: 'Tomás', apellido: 'Torres', conyuge_id: 'tania', ...sinGrupo, ...de(O_TORRES, 'Líder') }),
  persona({ usuario_id: 'tania', nombre: 'Tania', apellido: 'Torres', conyuge_id: 'tomas', ...sinGrupo, ...de(O_TORRES, 'Líder') }),
  persona({ usuario_id: 'ines', nombre: 'Inés', apellido: 'Gil', ...sinGrupo, ...de(O_TORRES, 'Miembro') }),
  persona({ usuario_id: 'yaneth', nombre: 'Yaneth', apellido: 'Rodríguez', genero: 'Femenino', conyuge_id: 'ramon', ...sinGrupo, ...de(O_FE, 'Líder') }),
  persona({ usuario_id: 'ramon', nombre: 'Ramón', apellido: 'Gil', genero: 'Masculino', conyuge_id: 'yaneth', ...sinGrupo }),
  persona({ usuario_id: 'nelly', nombre: 'Nelly', apellido: 'Castillo', ...sinGrupo, ...de(O_FE, 'Miembro') }),
]

const DIRECTOR_GENERAL: TemporadasPlanner = {
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: ['seg-mat', 'seg-muj'],
  segmentos: [
    // Pablo Viejo led Los Torres in 2025 - II but is no longer an eligible director de etapa.
    { id: 'seg-mat', nombre: 'Matrimonios', directores: [HECTOR] },
    { id: 'seg-muj', nombre: 'Mujeres +36', directores: [MARTA] },
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
  segmentos: [{ id: 'seg-muj', nombre: 'Mujeres +36', directores: [MARTA] }],
}

const datos = (parcial: Partial<DatosPlanner> = {}): DatosPlanner => ({
  capacidades: DIRECTOR_GENERAL,
  temporada: TEMPORADA,
  grupos: [ESCALONA, ROSAS],
  banco: bancoDe([ESCALONA, ROSAS], SIN_UBICAR),
  bloqueos: [],
  estado: null,
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

const ORIGEN_OK = { ok: true, origen: { id: 't-2025-ii', nombre: '2025 - II' }, grupos: [O_SILVA, O_TORRES, O_FE] }

/** The pending changes of the draft in localStorage (S24). */
function borrador(usuario = 'u-dg'): CambioPlanner[] {
  const texto = window.localStorage.getItem(`planner-gdv:borrador:${usuario}:${TEMPORADA.id}`)
  return texto ? (JSON.parse(texto) as { cambios: { cambio: CambioPlanner }[] }).cambios.map((c) => c.cambio) : []
}

const origen = () => screen.getByRole('region', { name: /^Origen · 2025 - II/ })
const destino = () => screen.getByRole('region', { name: /^Destino · 2026-II/ })
const fila = (zona: HTMLElement, nombre: string) => within(zona).getByRole('listitem', { name: nombre })

async function abrirLado(parcial: Partial<DatosPlanner> = {}) {
  render(<PlannerClient datos={datos(parcial)} />)
  await userEvent.click(screen.getByRole('button', { name: 'Lado a lado' }))
  await screen.findByRole('combobox', { name: 'Grupo de 2025 - II' })
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/grupos-vida/planificar')
  acciones.cargarOrigenAction.mockResolvedValue(ORIGEN_OK)
})

describe('switching to Lado a lado', () => {
  it('loads the origin groups once, keeps the view in the URL and opens the first origin group with people to place', async () => {
    await abrirLado()

    expect(screen.getByRole('button', { name: 'Lado a lado' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('region', { name: 'Grupos de la temporada, vista Tablero' })).not.toBeInTheDocument()
    expect(acciones.cargarOrigenAction).toHaveBeenCalledWith({ temporadaId: 't-2026-ii' })
    expect(window.location.search).toBe('?vista=lado')
    expect(screen.getByRole('combobox', { name: 'Grupo de 2025 - II' })).toHaveValue('o-silva')
    // The destination is the 2026-II group where the origin's leaders are now.
    expect(screen.getByRole('combobox', { name: 'Grupo de 2026-II' })).toHaveValue('g-escalona')
    // The bank stays available next to the two groups.
    expect(screen.getByRole('complementary', { name: 'Banco de personas' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tablero' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lado a lado' }))
    expect(acciones.cargarOrigenAction).toHaveBeenCalledTimes(1)
  })

  it('says why when the origin groups cannot be read, and retries', async () => {
    acciones.cargarOrigenAction.mockResolvedValueOnce({ ok: false, mensaje: 'No tienes permiso para usar el planificador.' })
    render(<PlannerClient datos={datos()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lado a lado' }))

    expect(await screen.findByText('No tienes permiso para usar el planificador.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('combobox', { name: 'Grupo de 2025 - II' })).toBeInTheDocument()
  })
})

describe('origin with the new season', () => {
  it('lists the origin people by role, couples as one row, each "Ya en <grupo>" or "Sin ubicar" (S23)', async () => {
    await abrirLado()

    expect(origen()).toHaveTextContent('7 personas · 3 ya ubicadas en 2026-II · 4 sin ubicar')
    expect(within(fila(origen(), 'Rafael Escalona')).getByText('Ya en Grupo #14 Los Escalona')).toBeInTheDocument()
    expect(within(fila(origen(), 'Douglas Paz')).getByText('Ya en Grupo #14 Los Escalona')).toBeInTheDocument()
    expect(within(fila(origen(), 'Carlos Mendoza y Yelitza Mendoza')).getByText('Sin ubicar')).toBeInTheDocument()
    expect(within(origen()).getByRole('region', { name: 'Aprendiz' })).toHaveTextContent('Frank Tovar')
    // Someone already placed has nothing to pass.
    expect(within(fila(origen(), 'Douglas Paz')).queryByRole('button', { name: /^Pasar/ })).not.toBeInTheDocument()
  })

  it('"Pasar" adds one pending move keeping the role (Colíder → aprendiz), shown at once on the right', async () => {
    await abrirLado()

    await userEvent.click(within(origen()).getByRole('button', { name: 'Pasar a Frank Tovar a Grupo #14 Los Escalona' }))

    expect(borrador()).toEqual([{ tipo: 'mover', usuarios: ['frank'], grupo: 'g-escalona', rol: 'aprendiz' }])
    expect(within(destino()).getByRole('region', { name: 'Aprendiz' })).toHaveTextContent('Frank Tovar')
    expect(within(fila(destino(), 'Frank Tovar')).getByText('Sin guardar')).toBeInTheDocument()
    expect(within(fila(origen(), 'Frank Tovar')).getByText('Ya en Grupo #14 Los Escalona')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^1 cambio sin guardar/ })).toBeInTheDocument()
    expect(acciones.guardarCambiosAction).not.toHaveBeenCalled()
  })

  it('moves a couple together into Matrimonios', async () => {
    await abrirLado()

    await userEvent.click(within(origen()).getByRole('button', { name: 'Pasar a Carlos Mendoza y Yelitza Mendoza a Grupo #14 Los Escalona' }))

    expect(borrador()).toEqual([{ tipo: 'mover', usuarios: ['c1', 'c2'], grupo: 'g-escalona', rol: 'miembro' }])
    expect(within(destino()).getByRole('region', { name: 'Miembros' })).toHaveTextContent('Carlos Mendoza y Yelitza Mendoza')
  })

  it('moves a person alone into another segment and says where the spouse stays (S2)', async () => {
    await abrirLado()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Grupo de 2025 - II' }), 'o-fe')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Grupo de 2026-II' }), 'g-rosas')

    await userEvent.click(within(origen()).getByRole('button', { name: 'Pasar a Yaneth Rodríguez a Las Rosas' }))

    expect(borrador()).toEqual([{ tipo: 'mover', usuarios: ['yaneth'], grupo: 'g-rosas', rol: 'lider' }])
    expect(toast.info).toHaveBeenCalledWith('Su esposo no viene: está en el banco')
  })

  it('"Pasar las N sin ubicar" adds one move per row with each role', async () => {
    await abrirLado()

    await userEvent.click(within(origen()).getByRole('button', { name: 'Pasar las 4 sin ubicar a Grupo #14 Los Escalona' }))

    expect(borrador()).toEqual([
      { tipo: 'mover', usuarios: ['frank'], grupo: 'g-escalona', rol: 'aprendiz' },
      { tipo: 'mover', usuarios: ['c1', 'c2'], grupo: 'g-escalona', rol: 'miembro' },
      { tipo: 'mover', usuarios: ['nora'], grupo: 'g-escalona', rol: 'miembro' },
    ])
    expect(origen()).toHaveTextContent('7 personas · 7 ya ubicadas en 2026-II · 0 sin ubicar')
    expect(within(origen()).queryByRole('button', { name: /^Pasar las/ })).not.toBeInTheDocument()
  })

  it('jumps to the next origin group with people to place', async () => {
    await abrirLado()

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente grupo con personas sin ubicar' }))

    expect(screen.getByRole('combobox', { name: 'Grupo de 2025 - II' })).toHaveValue('o-torres')
  })

  it('"Crear grupo copiando este" adds the group and its leaders with a tmp key, without the directors no longer eligible', async () => {
    await abrirLado()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Grupo de 2025 - II' }), 'o-torres')
    // None of the Torres is in a 2026-II group yet.
    expect(screen.getByRole('combobox', { name: 'Grupo de 2026-II' })).toHaveValue('')

    await userEvent.click(within(destino()).getByRole('button', { name: 'Crear grupo copiando Grupo Los Torres' }))

    expect(borrador()).toEqual([
      {
        tipo: 'crear',
        clave: 'tmp:g1',
        datos: {
          nombre: 'Grupo Los Torres',
          segmento_id: 'seg-mat',
          localidad_id: 'loc-cab',
          dia_reunion: 'Jueves',
          hora_reunion: '19:30',
          capacidad_maxima: 14,
          director_etapa_ids: ['u-hector'],
        },
      },
      { tipo: 'mover', usuarios: ['tomas', 'tania'], grupo: 'tmp:g1', rol: 'lider' },
    ])
    expect(screen.getByRole('combobox', { name: 'Grupo de 2026-II' })).toHaveValue('tmp:g1')
    expect(within(destino()).getByRole('region', { name: 'Líderes' })).toHaveTextContent('Tomás Torres y Tania Torres')
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('Pablo Viejo'))
  })
})

describe('two groups of the new season', () => {
  it('moves people from one group to the other keeping the role', async () => {
    await abrirLado()
    await userEvent.click(screen.getByRole('button', { name: 'Dos grupos de 2026-II' }))

    const izquierda = screen.getByRole('combobox', { name: 'Grupo de la izquierda' })
    const derecha = screen.getByRole('combobox', { name: 'Grupo de la derecha' })
    await userEvent.selectOptions(izquierda, 'g-escalona')
    await userEvent.selectOptions(derecha, 'g-rosas')

    const lado = screen.getByRole('region', { name: /^Izquierda/ })
    await userEvent.click(within(lado).getByRole('button', { name: 'Pasar a Douglas Paz a Las Rosas' }))

    expect(borrador()).toEqual([{ tipo: 'mover', usuarios: ['douglas'], grupo: 'g-rosas', rol: 'miembro' }])
    const otro = screen.getByRole('region', { name: /^Derecha/ })
    expect(within(otro).getByRole('region', { name: 'Miembro' })).toHaveTextContent('Douglas Paz')

    await userEvent.click(within(otro).getByRole('button', { name: 'Pasar a Lucía Pérez a Grupo #14 Los Escalona' }))
    await waitFor(() => expect(borrador()).toHaveLength(2))
    expect(borrador()[1]).toEqual({ tipo: 'mover', usuarios: ['lucia'], grupo: 'g-escalona', rol: 'lider' })
  })
})

describe('dragging', () => {
  it('drops a person of one group on a role of the other group', async () => {
    await abrirLado()
    await userEvent.click(screen.getByRole('button', { name: 'Dos grupos de 2026-II' }))

    const izquierda = screen.getByRole('region', { name: /^Izquierda/ })
    const derecha = screen.getByRole('region', { name: /^Derecha/ })
    fireEvent.dragStart(fila(izquierda, 'Douglas Paz'))
    fireEvent.dragOver(within(derecha).getByRole('region', { name: 'Aprendices' }))
    fireEvent.drop(within(derecha).getByRole('region', { name: 'Aprendices' }))

    expect(borrador()).toEqual([{ tipo: 'mover', usuarios: ['douglas'], grupo: 'g-rosas', rol: 'aprendiz' }])
  })

  it('asks who goes when a couple is passed into a group that is not Matrimonios (S2)', async () => {
    await abrirLado()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Grupo de 2026-II' }), 'g-rosas')

    await userEvent.click(within(origen()).getByRole('button', { name: 'Pasar a Carlos Mendoza y Yelitza Mendoza a Las Rosas' }))

    expect(screen.getByRole('dialog', { name: 'Ubicar a Carlos Mendoza y Yelitza Mendoza' })).toHaveTextContent('¿Quién va?')
    expect(borrador()).toEqual([])
  })
})

describe('scope by role (S10)', () => {
  it('shows a director de etapa only the groups of their segments in both selectors', async () => {
    await abrirLado({ capacidades: DIRECTOR_ETAPA, grupos: [ROSAS], banco: bancoDe([ROSAS], SIN_UBICAR) })

    const opciones = (nombre: string) =>
      within(screen.getByRole('combobox', { name: nombre }))
        .getAllByRole('option')
        .map((o) => (o as HTMLOptionElement).value)
        .filter(Boolean)
    expect(opciones('Grupo de 2025 - II')).toEqual(['o-fe'])
    expect(opciones('Grupo de 2026-II')).toEqual(['g-rosas'])
  })
})
