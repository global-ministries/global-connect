/**
 * `<PlannerClient>` — read-only board of /grupos-vida/planificar (T5a of
 * odd/tasks/planner-gdv.md; artboards 01, 03 and 08).
 *
 * The header: season switcher, summary, the alerts button and the publish
 * button for admin, pastor and director general only, whose label carries the
 * state (S16) and turns primary when ready; the director de etapa's scope
 * note instead (S10). The lanes and the compact card: computed label (S4),
 * "Falta el Líder", the localidad suggestion (S3), badges and the members
 * expanded in place. The alerts panel lists the blockers by kind (S6). The
 * toolbar's bank toggle and search.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PlannerClient } from '@/components/grupos-vida/planner/planner-client'
import { bancoDe, enGrupo, grupo, LOCALIDADES } from '@/lib/platform/grupos-vida/planner/__fixtures__/planner'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'
import type { Bloqueo, EstadoPublicacion, GrupoTablero, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'

// The page header renders behind Suspense — synchronous test double.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

// The steps (T5b) are covered in pasos-planner.test.tsx; here the board only renders.
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  moverPersonasAction: jest.fn(),
  crearGrupoAction: jest.fn(),
  editarGrupoAction: jest.fn(),
  eliminarGrupoAction: jest.fn(),
  deshacerPasoAction: jest.fn(),
  marcarSegmentoAction: jest.fn(),
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

const estado = (parcial: Partial<EstadoPublicacion> = {}): EstadoPublicacion => ({
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
  ...parcial,
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
  temporadas: [TEMPORADA, { ...TEMPORADA, id: 't-2026-i', nombre: '2026-I', estado: 'activa', activa: true }],
}

const DIRECTOR_ETAPA: TemporadasPlanner = {
  ...DIRECTOR_GENERAL,
  usuario_id: 'u-etapa',
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
  bloqueos: BLOQUEOS,
  estado: estado(),
  localidades: LOCALIDADES,
  faltantes: [],
  ...parcial,
})

/** The summary line under the season switcher. */
const resumen = (): HTMLElement | null => document.querySelector('#planner-temporada > p')

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
})

describe('season header', () => {
  it('shows the season switcher as the h1, the state and the counts', async () => {
    render(<PlannerClient datos={datos()} />)

    const selector = screen.getByRole('button', { name: 'Temporada 2026-II, cambiar de temporada' })
    expect(screen.getByRole('heading', { level: 1 })).toContainElement(selector)
    expect(resumen()).toHaveTextContent('En planificación · 2 grupos · 8 personas')

    await userEvent.click(selector)
    expect(selector).toHaveAttribute('aria-expanded', 'true')
    const temporadas = screen.getByRole('list', { name: 'Temporadas' })
    expect(within(temporadas).getByRole('link', { name: /2026-II/ })).toHaveAttribute('aria-current', 'page')
    expect(within(temporadas).getByRole('link', { name: /2026-I\b.*Activa/ })).toHaveAttribute('href', '/grupos-vida/planificar?temporada=t-2026-i')
    expect(screen.getByRole('link', { name: 'Nueva temporada' })).toHaveAttribute('href', '/grupos-vida/planificar/nueva')
  })

  it('gives the director general the publish button with the season state (S16), ghost until ready', () => {
    render(<PlannerClient datos={datos()} />)

    const publicar = screen.getByRole('link', { name: 'Publicar · 2 bloqueos · faltan 2 segmentos' })
    expect(publicar).toHaveAttribute('href', '/grupos-vida/planificar/publicar?temporada=t-2026-ii')
    expect(publicar).not.toHaveClass('bg-brand-strong')
    expect(screen.queryByText(/Ves los grupos de tus segmentos/)).not.toBeInTheDocument()
  })

  it('turns the publish button primary when planner_estado_publicacion says it is ready', () => {
    const listo = estado({ bloqueos: { total: 0, sin_lider: 0, sin_director: 0, sin_localidad: 0, persona_en_dos_grupos: 0 }, faltan_segmentos: 0, puede_publicar: true })
    render(<PlannerClient datos={datos({ estado: listo, bloqueos: [] })} />)

    expect(screen.getByRole('link', { name: 'Publicar' })).toHaveClass('bg-brand-strong')
  })

  it('keeps a plain "Publicar" when the publish state could not be read', () => {
    render(<PlannerClient datos={datos({ estado: null, faltantes: ['estado_publicacion'] })} />)

    expect(screen.getByRole('link', { name: 'Publicar' })).not.toHaveClass('bg-brand-strong')
  })

  it('shows a director de etapa the scope note and no publish button or new season (S10, S12)', async () => {
    render(<PlannerClient datos={datos({ capacidades: DIRECTOR_ETAPA, grupos: [VALIENTES], bloqueos: [BLOQUEOS[1]] })} />)

    expect(screen.getByRole('note')).toHaveTextContent('Ves los grupos de tus segmentos: Mujeres +36.')
    expect(screen.queryByRole('link', { name: /^Publicar/ })).not.toBeInTheDocument()
    expect(resumen()).toHaveTextContent('En planificación · Mujeres +36 · 1 grupo · 2 personas')
    expect(screen.getByRole('heading', { level: 2, name: 'Mujeres +36' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Matrimonios' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cambiar de temporada/ }))
    expect(screen.queryByRole('link', { name: 'Nueva temporada' })).not.toBeInTheDocument()
  })

  it('names the blockers and warnings on the alerts button', () => {
    render(<PlannerClient datos={datos()} />)

    expect(screen.getByRole('button', { name: /^Alertas: 2 bloqueos y \d+ avisos?$/ })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('board', () => {
  it('opens one lane per segment with "Sin localidad" first', () => {
    render(<PlannerClient datos={datos()} />)

    const matrimonios = screen.getByRole('region', { name: 'Matrimonios' })
    expect(within(matrimonios).getByRole('group', { name: 'Sin localidad, 1 grupo' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Mujeres +36' })).getByRole('group', { name: 'Barquisimeto, 1 grupo' })).toBeInTheDocument()
    expect(within(matrimonios).getByRole('button', { name: 'Grupos anteriores de Matrimonios' })).toBeDisabled()
  })

  it('shows the computed label, the leaders and the localidad suggestion of a group without localidad (S3, S4)', () => {
    render(<PlannerClient datos={datos()} />)

    const tarjeta = screen.getByRole('article', { name: 'Grupo #9 Familia Torrealba' })
    expect(within(tarjeta).getByText('Matrimonios · Sin localidad')).toHaveClass('text-danger-text')
    expect(within(tarjeta).getByText('José y Mariela Torrealba')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Sugerida · los líderes y 4 de 4 viven en Palavecino')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('button', { name: 'Usar Cabudare como localidad de Grupo #9 Familia Torrealba' })).toBeEnabled()
    expect(within(tarjeta).getByText('Sin localidad')).toBeInTheDocument()
  })

  it('marks a group without Líder and shows no suggestion line when it has a localidad', () => {
    render(<PlannerClient datos={datos()} />)

    const tarjeta = screen.getByRole('article', { name: 'Mujeres Valientes' })
    expect(within(tarjeta).getByText('Mujeres +36 · Barquisimeto')).not.toHaveClass('text-danger-text')
    expect(within(tarjeta).getAllByText('Falta el Líder')[0]).toBeInTheDocument()
    expect(within(tarjeta).getByText('Sin Líder')).toBeInTheDocument()
    expect(within(tarjeta).queryByText(/Sugerida/)).not.toBeInTheDocument()
  })

  it('shows no suggestion at all when the localidades could not be read, and says so', () => {
    render(<PlannerClient datos={datos({ localidades: [], faltantes: ['localidades'] })} />)

    expect(screen.queryByText(/Sugerida/)).not.toBeInTheDocument()
    expect(screen.getByText(/No se pudieron leer las localidades/)).toBeInTheDocument()
  })

  it('expands the members by role in place', async () => {
    render(<PlannerClient datos={datos()} />)

    const tarjeta = screen.getByRole('article', { name: 'Grupo #9 Familia Torrealba' })
    const boton = within(tarjeta).getByRole('button', { name: '6 integrantes' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(within(tarjeta).queryByRole('region', { name: 'Aprendiz' })).not.toBeInTheDocument()

    await userEvent.click(boton)

    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(within(tarjeta).getByRole('region', { name: 'Líderes' })).toHaveTextContent('José Torrealba')
    expect(within(tarjeta).getByRole('region', { name: 'Aprendiz' })).toHaveTextContent('Leonardo Mujica')
    expect(within(tarjeta).getByRole('region', { name: 'Miembros' })).toHaveTextContent('m1 Pérez')
  })

  it('filters the groups by the search, by group or person name', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar grupo, líder o persona' }), 'mujica')

    expect(screen.getByRole('article', { name: 'Grupo #9 Familia Torrealba' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Mujeres Valientes' })).not.toBeInTheDocument()

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar grupo, líder o persona' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar grupo, líder o persona' }), 'nadie así')
    expect(screen.getByText('Ningún grupo coincide')).toBeInTheDocument()
  })

  it('hides and shows the bank, with the unplaced count on the toggle (S17)', async () => {
    render(<PlannerClient datos={datos({ capacidades: { ...DIRECTOR_GENERAL, usuario_id: 'u-toggle' } })} />)

    const ocultar = screen.getByRole('button', { name: 'Ocultar banco' })
    expect(ocultar).toHaveAttribute('aria-expanded', 'true')
    expect(ocultar).toHaveAttribute('aria-controls', 'banco-personas')

    await userEvent.click(ocultar)

    const mostrar = screen.getByRole('button', { name: 'Mostrar banco · 0 sin ubicar' })
    expect(mostrar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('complementary', { name: 'Banco de personas' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('planner-gdv:banco-oculto:u-toggle')).toBe('1')
  })

  it('tells that Lado a lado comes later', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Lado a lado · pronto' }))

    expect(toast.info).toHaveBeenCalledWith('La vista Lado a lado llega pronto.')
    expect(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('alerts panel', () => {
  it('lists the four blockers by kind with their groups, and the warnings by kind (S6, S7)', async () => {
    render(<PlannerClient datos={datos()} />)

    await userEvent.click(screen.getByRole('button', { name: /^Alertas:/ }))

    const panel = screen.getByRole('dialog', { name: 'Alertas de 2026-II' })
    const sinLocalidad = within(panel).getByRole('region', { name: '1 grupo sin localidad' })
    expect(sinLocalidad).toHaveTextContent('Grupo #9 Familia Torrealba')
    expect(within(sinLocalidad).getByRole('button', { name: 'Ir al grupo' })).toBeInTheDocument()
    expect(within(panel).getByRole('region', { name: '1 grupo sin Líder' })).toHaveTextContent('Mujeres Valientes')
    expect(within(panel).getByRole('region', { name: '0 grupos sin director de etapa' })).toHaveTextContent('Todo en orden')
    expect(within(panel).getByRole('region', { name: '0 personas en dos grupos de 2026-II' })).toHaveTextContent('Todo en orden')
    // Mujeres Valientes has 2 people: small group and nobody leads it.
    expect(within(panel).getByRole('region', { name: /grupos? pequeños? \(menos de 6\)/ })).toHaveTextContent('Mujeres Valientes')
  })
})

describe('page layout', () => {
  // The shell's <main> scrolls and is not positioned: an absolute element
  // (the sr-only live region) whose containing block is the viewport sat at
  // the end of the long board and made the document itself scroll into an
  // empty area below the shell. The page root contains it.
  it('keeps the live region inside a positioned page root, so the document never scrolls', () => {
    render(<PlannerClient datos={datos()} />)

    const anuncio = screen.getByRole('status', { name: 'Cambios del planificador' })
    expect(anuncio).toHaveClass('sr-only')
    expect(anuncio.closest('[data-ancho]')).toHaveClass('relative')
  })
})
