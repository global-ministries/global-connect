/**
 * `<PlannerClient>` on a phone (< 768px; T8c of odd/tasks/planner-gdv.md,
 * artboard 05 of design/planner-gdv; S9, S11, S21, S24).
 *
 * No lanes and no drag on touch: the groups are an inset list by segment and
 * localidad whose rows open the group panel as a bottom sheet; the bank is a
 * "Banco · N sin ubicar" button that opens it as a sheet with "Ubicar" on
 * each row; only the Tablero view; the header keeps the save chip, Guardar,
 * the alerts chip and a "Más acciones" menu with Historial and Publicar.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { bancoDe, enGrupo, grupo, LOCALIDADES, persona } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { Bloqueo, EstadoPublicacion, GrupoTablero, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  guardarCambiosAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
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
  localidad_id: null,
  localidad_nombre: null,
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  capacidad_maxima: 16,
  lideres: [
    { ...enGrupo('l1'), nombre: 'José', apellido: 'Torrealba' },
    { ...enGrupo('l2'), nombre: 'Mariela', apellido: 'Torrealba' },
  ],
  aprendices: [{ ...enGrupo('a1'), nombre: 'Leonardo', apellido: 'Mujica' }],
  miembros: [enGrupo('m1'), enGrupo('m2'), enGrupo('m3')],
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

const BLOQUEOS: Bloqueo[] = [
  { tipo: 'sin_localidad', segmento_id: 'seg-mat', grupo_id: 'g-torrealba', grupo_nombre: 'Grupo #9 Familia Torrealba', usuario_id: null, detalle: '' },
  { tipo: 'sin_lider', segmento_id: 'seg-muj', grupo_id: 'g-valientes', grupo_nombre: 'Mujeres Valientes', usuario_id: null, detalle: '' },
]

const ESTADO: EstadoPublicacion = {
  temporada: { id: TEMPORADA.id, nombre: TEMPORADA.nombre, estado: 'planificacion', activa: false, cohorte: 'II' },
  bloqueos: { total: 2, sin_lider: 1, sin_director: 0, sin_localidad: 1, persona_en_dos_grupos: 0 },
  grupos: 2,
  segmentos: [],
  segmentos_con_grupos: 2,
  segmentos_terminados: 0,
  faltan_segmentos: 2,
  rol_puede_publicar: true,
  puede_publicar: false,
  origen: null,
  otras_activas: [],
}

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
  grupos: [TORREALBA, VALIENTES],
  banco: bancoDe(
    [TORREALBA, VALIENTES],
    [persona({ usuario_id: 'nueva', nombre: 'Ana Lucía', apellido: 'Méndez', grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 })],
  ),
  bloqueos: BLOQUEOS,
  estado: ESTADO,
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

/** Mocks matchMedia so `(min-width: 768px)` does not match: a phone. */
const matchMediaOriginal = window.matchMedia
beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/grupos-vida/planificar')
  window.matchMedia = jest.fn((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

const lista = () => screen.getByRole('region', { name: 'Grupos de la temporada, lista' })
const fila = (nombre: string) => within(lista()).getByRole('button', { name: (n) => n.startsWith(nombre) })

describe('the phone board', () => {
  it('lists the groups by segment, then localidad ("Sin localidad" first), with no lanes', () => {
    render(<PlannerClient datos={datos()} />)

    const matrimonios = within(lista()).getByRole('region', { name: 'Matrimonios' })
    const sinLocalidad = within(matrimonios).getByRole('list', { name: 'Matrimonios, Sin localidad' })
    expect(within(sinLocalidad).getByRole('button', { name: /^Grupo #9 Familia Torrealba/ })).toBeInTheDocument()
    const mujeres = within(lista()).getByRole('region', { name: 'Mujeres +36' })
    expect(within(mujeres).getByRole('list', { name: 'Mujeres +36, Barquisimeto' })).toContainElement(fila('Mujeres Valientes'))

    // Name, computed label, leaders, count over capacity and badges in the row.
    const torrealba = fila('Grupo #9 Familia Torrealba')
    expect(torrealba).toHaveTextContent('Matrimonios · Sin localidad')
    expect(torrealba).toHaveTextContent('José y Mariela Torrealba')
    expect(torrealba).toHaveTextContent('6 / 16')
    expect(torrealba).toHaveTextContent('Sin localidad')
    expect(fila('Mujeres Valientes')).toHaveTextContent('Falta el Líder')

    expect(screen.queryByRole('region', { name: 'Grupos de la temporada, vista Tablero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Más grupos de Matrimonios' })).not.toBeInTheDocument()
  })

  it('opens the group panel as a sheet from a row', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.click(fila('Grupo #9 Familia Torrealba'))
    const hoja = await screen.findByRole('dialog', { name: 'Grupo #9 Familia Torrealba' })
    expect(hoja).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
  })

  it('offers "Nuevo grupo" at the end of each segment the actor edits', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.click(within(lista()).getByRole('button', { name: 'Nuevo grupo en Mujeres +36' }))
    expect(await screen.findByRole('dialog', { name: 'Nuevo grupo de Mujeres +36' })).toBeInTheDocument()
  })
})

describe('the phone bank', () => {
  it('is a button that opens the bank as a sheet, with search, filters and "Ubicar" (no drag)', async () => {
    render(<PlannerClient datos={datos()} />)

    expect(screen.queryByRole('button', { name: 'Ocultar banco' })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Banco de personas' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Banco · \d+ sin ubicar$/ }))
    const hoja = await screen.findByRole('dialog', { name: 'Banco de personas' })
    expect(within(hoja).getByRole('searchbox', { name: 'Buscar en el banco por nombre, ciudad o grupo' })).toBeInTheDocument()
    expect(within(hoja).getByRole('group', { name: 'Filtros rápidos del banco' })).toBeInTheDocument()
    const ubicar = within(hoja).getByRole('button', { name: 'Ubicar a Ana Lucía Méndez' })
    expect(ubicar.closest('li')).not.toHaveAttribute('draggable', 'true')

    // vaul's pointer handlers need a real layout: click inside a sheet without pointer events.
    fireEvent.click(ubicar)
    const dialogo = await screen.findByRole('dialog', { name: 'Ubicar a Ana Lucía Méndez' })
    expect(dialogo).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
    expect(within(dialogo).getByRole('combobox', { name: 'Grupo' })).toBeInTheDocument()
  })
})

describe('the phone header and views', () => {
  it('shows only the Tablero: no view switch, and "?vista=lado" says it needs a big screen', () => {
    render(<PlannerClient datos={datos()} vistaInicial="lado" />)

    expect(screen.queryByRole('button', { name: 'Lado a lado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Vista' })).not.toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Lado a lado está disponible en pantalla grande.')
    expect(lista()).toBeInTheDocument()
  })

  it('keeps the save chip, Guardar and the alerts chip, and puts Historial and Publicar in "Más acciones"', async () => {
    render(<PlannerClient datos={datos()} />)

    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Historial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Publicar/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Más acciones' }))
    const menu = screen.getByRole('list', { name: 'Más acciones' })
    expect(within(menu).getByRole('link', { name: 'Publicar · 2 bloqueos · faltan 2 segmentos' })).toHaveAttribute(
      'href',
      '/grupos-vida/planificar/publicar?temporada=t-2026-ii',
    )
    await userEvent.click(within(menu).getByRole('button', { name: 'Historial' }))
    const historial = await screen.findByRole('dialog', { name: 'Historial de 2026-II' })
    expect(historial).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
  })

  it('opens the alerts from the chip as a sheet', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.click(screen.getByRole('button', { name: /^Alertas: 2 bloqueos y \d+ avisos?$/ }))
    const alertas = await screen.findByRole('dialog', { name: 'Alertas de 2026-II' })
    expect(alertas).toHaveAttribute('data-vaul-drawer-direction', 'bottom')
    fireEvent.keyDown(alertas, { key: 'Escape' })
    await waitFor(() => expect(alertas).toHaveAttribute('data-state', 'closed'))
  })
})
