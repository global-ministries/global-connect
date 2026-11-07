/**
 * The new-season assistant /grupos-vida/planificar/nueva (T8b of
 * odd/tasks/planner-gdv.md; artboard 10; S18, S19, S20): only admin, pastor
 * and director general (a director de etapa goes to the board, anyone else to
 * the dashboard). Four steps: 1 the new season with the name and dates of the
 * cohort rule (created En planificación, no "activa" toggle) or one already
 * in planning; 2 the season it closes, by cohort, and the other cohort that
 * is not touched; 3 the closing diagnosis; 4 copy the groups (recommended) or
 * start blank. "Crear y abrir el planificador" creates the season, copies
 * the groups in batches of up to 200 changes and opens the board; a failed
 * batch keeps the season and what was copied and lets the user go on. Also
 * the "Diagnóstico de cierre" page of a planner season.
 */
import React from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsistenteTemporada, type AsistenteTemporadaProps } from '@/components/grupos-vida/planner/asistente-temporada'
import type { GrupoTablero, TemporadaPlanner, TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'
import { diagnosticarCierre } from '@/lib/platform/grupos-vida/planner/diagnostico'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const push = jest.fn()
const redirect = jest.fn((ruta: string) => {
  throw new Error(`redirect:${ruta}`)
})
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }), redirect: (ruta: string) => redirect(ruta) }))

const crearTemporadaAction = jest.fn()
const cargarCierreAction = jest.fn()
const guardarCambiosAction = jest.fn()
jest.mock('@/app/(auth)/grupos-vida/planificar/actions', () => ({
  crearTemporadaAction: (...a: unknown[]) => crearTemporadaAction(...a),
  cargarCierreAction: (...a: unknown[]) => cargarCierreAction(...a),
  guardarCambiosAction: (...a: unknown[]) => guardarCambiosAction(...a),
}))

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const temporada = (id: string, nombre: string, fecha_inicio: string, fecha_fin: string, parcial: Partial<TemporadaPlanner> = {}): TemporadaPlanner => ({
  id,
  nombre,
  fecha_inicio,
  fecha_fin,
  estado: 'activa',
  activa: true,
  cohorte: nombre.endsWith('II') ? 'II' : 'I',
  origen_id: null,
  origen_nombre: null,
  ...parcial,
})

const T2026_I = temporada(uuid(1), '2026-I', '2026-02-16', '2027-02-05')
const T2025_II = temporada(uuid(2), '2025 - II', '2025-10-13', '2026-10-11', { estado: 'finalizada', activa: false })
const T2026_II = temporada(uuid(3), '2026-II', '2026-10-12', '2027-10-10', { estado: 'planificacion', activa: false, origen_id: uuid(2), origen_nombre: '2025 - II' })

const SEG = uuid(900)
const capacidades = (temporadas: TemporadaPlanner[] = [T2026_II, T2026_I, T2025_II]): TemporadasPlanner => ({
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: [SEG],
  segmentos: [{ id: SEG, nombre: 'Matrimonios', directores: [{ segmento_lider_id: uuid(700), usuario_id: uuid(800), nombre: 'Héctor', apellido: 'Linárez' }] }],
  temporadas,
})

const grupoOrigen = (n: number): GrupoTablero => ({
  grupo_id: uuid(1000 + n),
  nombre: `Grupo ${n}`,
  segmento_id: SEG,
  segmento_nombre: 'Matrimonios',
  localidad_id: uuid(500),
  localidad_nombre: n % 2 ? 'Cabudare' : 'Barquisimeto',
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  capacidad_maxima: 15,
  estado_ciclo: 'activo',
  estado_aprobacion: 'aprobado',
  activo: true,
  directores: [{ segmento_lider_id: uuid(700), usuario_id: uuid(800), nombre: 'Héctor', apellido: 'Linárez' }],
  lideres: [{ usuario_id: uuid(2000 + n), nombre: 'Ana', apellido: `L${n}`, lideres_origen: [] }],
  aprendices: [{ usuario_id: uuid(3000 + n), nombre: 'Luis', apellido: `A${n}`, lideres_origen: [] }],
  miembros: [],
})

const cierre = (grupos: GrupoTablero[], gruposDestino: number | null = null) => ({ ok: true, grupos, diagnostico: diagnosticarCierre(grupos, []), gruposDestino })

const props = (parcial: Partial<AsistenteTemporadaProps> = {}): AsistenteTemporadaProps => ({ capacidades: capacidades(), hoy: '2026-11-07', ...parcial })

async function pintar(ui: React.ReactElement) {
  await act(async () => {
    render(ui)
  })
}

const siguiente = () => userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

beforeEach(() => {
  jest.clearAllMocks()
  cargarCierreAction.mockResolvedValue(cierre([grupoOrigen(1), grupoOrigen(2)]))
  crearTemporadaAction.mockResolvedValue({ ok: true, datos: { id: uuid(4), nombre: '2027-I', cohorte: 'I', origen: { id: uuid(1), nombre: '2026-I' } } })
  guardarCambiosAction.mockResolvedValue({ ok: true, datos: { guardados: 4, pasos: [], gruposCreados: {} } })
})

describe('paso 1 · Nueva temporada', () => {
  it('suggests the next season of the cohort rule, created in planning, without an "activa" toggle', async () => {
    await pintar(<AsistenteTemporada {...props()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Planificar nueva temporada' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('2027-I')
    expect(screen.getByLabelText('Empieza')).toHaveValue('2027-02-08')
    expect(screen.getByLabelText('Termina')).toHaveValue('2028-02-06')
    expect(screen.getByText(/después de que termina 2026-I/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Se crea En planificación, no activa.')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const pasos = screen.getByRole('list', { name: 'Pasos del asistente' })
    expect(within(pasos).getByText('Nueva temporada').closest('[aria-current="step"]')).not.toBeNull()
    expect(within(pasos).queryAllByRole('button')).toHaveLength(0)
  })

  it('refuses a name without cohort or a repeated one with the RPC words and stays on paso 1', async () => {
    await pintar(<AsistenteTemporada {...props()} />)
    const nombre = screen.getByLabelText('Nombre')

    await userEvent.clear(nombre)
    await userEvent.type(nombre, '2026 - i')
    await siguiente()
    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe una temporada llamada «2026-I».')

    await userEvent.clear(nombre)
    await userEvent.type(nombre, '2027')
    await siguiente()
    expect(screen.getByRole('alert')).toHaveTextContent('El nombre debe terminar en la cohorte')
    expect(screen.getByRole('heading', { level: 2, name: '¿Qué temporada vas a planificar?' })).toBeInTheDocument()
    expect(cargarCierreAction).not.toHaveBeenCalled()
  })

  it('offers a season already in planning, disabled with the reason when there is none', async () => {
    await pintar(<AsistenteTemporada {...props({ capacidades: capacidades([T2026_I, T2025_II]) })} />)
    const usar = screen.getByRole('radio', { name: 'Usar una temporada que ya está en planificación' })
    expect(usar).toBeDisabled()
    expect(screen.getByText('No hay ninguna ahora. Las que se crean en Temporadas aparecen aquí.')).toBeInTheDocument()
  })
})

describe('pasos 2 and 3', () => {
  it('shows the season it closes by cohort, the other cohort untouched, then the diagnosis', async () => {
    await pintar(<AsistenteTemporada {...props()} />)
    await siguiente()

    expect(screen.getByRole('heading', { level: 2, name: '¿Qué temporada termina cuando publiques 2027-I?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /2026-I/ })).toBeChecked()
    expect(screen.getByText('2026-II no se toca.')).toBeInTheDocument()
    expect(cargarCierreAction).toHaveBeenCalledWith({ origenId: uuid(1), destinoId: null })
    expect(await screen.findByText(/2 grupos · 4 personas/)).toBeInTheDocument()

    await siguiente()
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo termina 2026-I' })).toBeInTheDocument()
    expect(screen.getByText('Listos para liderar un grupo').nextSibling).toHaveTextContent('2')
    expect(screen.getByRole('region', { name: 'Grupos sugeridos para 2027-I' })).toHaveTextContent('Sugeridos3')
  })

  it('says "Ninguna" for the first season of a cohort', async () => {
    await pintar(<AsistenteTemporada {...props({ capacidades: capacidades([T2026_I]) })} />)
    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), '2027-II')
    await siguiente()

    expect(screen.getByRole('radio', { name: 'Ninguna' })).toBeChecked()
    expect(screen.getByText(/es la primera de la cohorte «II»/)).toBeInTheDocument()
    expect(cargarCierreAction).not.toHaveBeenCalled()
  })

  it('goes back with Atrás and through the stepper to a step already reached', async () => {
    await pintar(<AsistenteTemporada {...props()} />)
    await siguiente()
    await siguiente()
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(screen.getByRole('heading', { level: 2, name: /termina cuando publiques/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Nueva temporada/ }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('2027-I')
    // Step 4 was never reached: it is not a button.
    expect(screen.queryByRole('button', { name: /Cómo empezar/ })).not.toBeInTheDocument()
  })
})

async function irAlPaso4() {
  await siguiente()
  await screen.findByText(/2 grupos · 4 personas/)
  await siguiente()
  await siguiente()
}

describe('paso 4 · create and open', () => {
  it('copy (recommended): creates the season, then saves crear + mover of the leaders, then opens the board', async () => {
    await pintar(<AsistenteTemporada {...props()} />)
    await irAlPaso4()

    expect(screen.getByRole('radio', { name: /Copiar los grupos de 2026-I/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Crear y abrir el planificador' }))

    expect(crearTemporadaAction).toHaveBeenCalledWith({ nombre: '2027-I', fechaInicio: '2027-02-08', fechaFin: '2028-02-06' })
    expect(guardarCambiosAction).toHaveBeenCalledTimes(1)
    const [{ temporadaId, cambios }] = guardarCambiosAction.mock.calls[0]
    expect(temporadaId).toBe(uuid(4))
    expect(cambios.map((c: { tipo: string }) => c.tipo)).toEqual(['crear', 'mover', 'crear', 'mover'])
    expect(cambios[1]).toEqual({ tipo: 'mover', usuarios: [uuid(2001)], grupo: 'tmp:g1', rol: 'lider' })
    expect(crearTemporadaAction.mock.invocationCallOrder[0]).toBeLessThan(guardarCambiosAction.mock.invocationCallOrder[0])
    expect(push).toHaveBeenCalledWith(`/grupos-vida/planificar?temporada=${uuid(4)}`)
  })

  it('blank: creates the season and opens the board without copying', async () => {
    await pintar(<AsistenteTemporada {...props()} />)
    await irAlPaso4()
    await userEvent.click(screen.getByRole('radio', { name: 'Empezar en blanco' }))
    await userEvent.click(screen.getByRole('button', { name: 'Crear y abrir el planificador' }))

    expect(crearTemporadaAction).toHaveBeenCalledTimes(1)
    expect(guardarCambiosAction).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(`/grupos-vida/planificar?temporada=${uuid(4)}`)
  })

  it('a refused season shows the reason, copies nothing and lets the user try again', async () => {
    crearTemporadaAction.mockResolvedValueOnce({ ok: false, codigo: '22023', mensaje: 'Ya existe una temporada llamada «2027-I».' })
    await pintar(<AsistenteTemporada {...props()} />)
    await irAlPaso4()
    await userEvent.click(screen.getByRole('button', { name: 'Crear y abrir el planificador' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe una temporada llamada «2027-I».')
    expect(guardarCambiosAction).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Crear y abrir el planificador' })).toBeEnabled()
  })

  it('copies more than 200 changes in batches; a failed batch keeps the season and what was copied', async () => {
    cargarCierreAction.mockResolvedValue(cierre(Array.from({ length: 150 }, (_, i) => grupoOrigen(i + 1))))
    guardarCambiosAction
      .mockResolvedValueOnce({ ok: true, datos: { guardados: 200, pasos: [], gruposCreados: {} } })
      .mockResolvedValueOnce({ ok: false, codigo: '22023', mensaje: 'Cambio 3 de 100: La localidad no es válida.', indice: 2 })
    await pintar(<AsistenteTemporada {...props()} />)
    await siguiente()
    await screen.findByText(/150 grupos/)
    await siguiente()
    await siguiente()
    await userEvent.click(screen.getByRole('button', { name: 'Crear y abrir el planificador' }))

    expect(guardarCambiosAction).toHaveBeenCalledTimes(2)
    expect(guardarCambiosAction.mock.calls.map(([e]) => e.cambios.length)).toEqual([200, 100])
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('2027-I ya existe y se copiaron 100 de 150 grupos. Cambio 3 de 100: La localidad no es válida.')
    expect(within(alerta).getByRole('link', { name: 'Abrir el planificador' })).toHaveAttribute('href', `/grupos-vida/planificar?temporada=${uuid(4)}`)
    expect(push).not.toHaveBeenCalled()

    // "Copiar los que faltan" retries only the failed batch, without creating the season again.
    await userEvent.click(within(alerta).getByRole('button', { name: 'Copiar los que faltan' }))
    expect(crearTemporadaAction).toHaveBeenCalledTimes(1)
    expect(guardarCambiosAction).toHaveBeenCalledTimes(3)
    expect(guardarCambiosAction.mock.calls[2][0].cambios).toHaveLength(100)
    expect(push).toHaveBeenCalledWith(`/grupos-vida/planificar?temporada=${uuid(4)}`)
  })

  it('a season already in planning with groups only keeps what it has', async () => {
    cargarCierreAction.mockResolvedValue(cierre([grupoOrigen(1)], 27))
    await pintar(<AsistenteTemporada {...props()} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Usar una temporada que ya está en planificación' }))
    await siguiente()
    expect(cargarCierreAction).toHaveBeenCalledWith({ origenId: uuid(2), destinoId: uuid(3) })
    await screen.findByText(/1 grupo · 2 personas/)
    await siguiente()
    await siguiente()

    expect(screen.getByRole('radio', { name: /Copiar los grupos de 2025 - II/ })).toBeDisabled()
    expect(screen.getByText('2026-II ya tiene 27 grupos: sigue con lo que tiene.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Seguir con lo que ya tiene 2026-II' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir el planificador' }))
    expect(crearTemporadaAction).not.toHaveBeenCalled()
    expect(guardarCambiosAction).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith(`/grupos-vida/planificar?temporada=${uuid(3)}`)
  })
})

// ─── The pages (RSC) ───

const getUserWithRoles = jest.fn()
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (c: unknown) => getUserWithRoles(c) }))
const rpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: (...a: unknown[]) => rpc(...a), from: jest.fn() }) }))

const respuestaTemporadas = (puede = true) => ({
  data: { ...capacidades(), puede_crear_temporada: puede, puede_publicar: puede },
  error: null,
})

describe('new-season page', () => {
  const pagina = async (roles: string[] | null) => {
    getUserWithRoles.mockResolvedValue(roles ? { user: { id: 'auth-1' }, roles } : null)
    const { default: NuevaTemporadaPage } = await import('@/app/(auth)/grupos-vida/planificar/nueva/page')
    return NuevaTemporadaPage()
  }

  it('sends a director de etapa to the board and other roles to the dashboard, without reading anything', async () => {
    await expect(pagina(['director-etapa'])).rejects.toThrow('redirect:/grupos-vida/planificar')
    await expect(pagina(['lider'])).rejects.toThrow('redirect:/dashboard')
    await expect(pagina(null)).rejects.toThrow('redirect:/login')
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([['director-general'], ['admin'], ['pastor']])('opens the assistant for %s', async (rol) => {
    rpc.mockResolvedValue(respuestaTemporadas())
    const vista = await pagina([rol])
    await pintar(vista)
    expect(rpc).toHaveBeenCalledWith('planner_temporadas')
    expect(screen.getByLabelText('Nombre')).toHaveValue('2027-I')
  })

  it('sends to the board when planner_temporadas says the user cannot create seasons', async () => {
    rpc.mockResolvedValue(respuestaTemporadas(false))
    await expect(pagina(['director-general'])).rejects.toThrow('redirect:/grupos-vida/planificar')
  })
})

describe('closing diagnosis page', () => {
  const pagina = async (roles: string[]) => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles })
    const { default: DiagnosticoCierrePage } = await import('@/app/(auth)/grupos-vida/planificar/diagnostico/page')
    return DiagnosticoCierrePage({ searchParams: Promise.resolve({ temporada: uuid(3) }) })
  }

  it('sends a role outside the planner to the dashboard', async () => {
    await expect(pagina(['miembro'])).rejects.toThrow('redirect:/dashboard')
  })

  it('shows the diagnosis of the season the current one closes, for a director de etapa too', async () => {
    rpc.mockImplementation((nombre: string, args?: { p_temporada_id?: string }) => {
      if (nombre === 'planner_temporadas') return Promise.resolve(respuestaTemporadas(false))
      const datos = nombre === 'planner_tablero' && args?.p_temporada_id === uuid(2) ? [grupoOrigen(1), grupoOrigen(2), grupoOrigen(3)] : []
      return { range: async (desde: number) => ({ data: desde === 0 ? datos : [], error: null }) }
    })
    await pintar(await pagina(['director-etapa']))

    expect(screen.getByRole('heading', { level: 1, name: 'Cómo termina 2025 - II' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Grupos sugeridos para 2026-II' })).toHaveTextContent('Sugeridos4')
    expect(screen.getByRole('link', { name: '2026-II' })).toHaveAttribute('href', `/grupos-vida/planificar?temporada=${uuid(3)}`)
  })
})
