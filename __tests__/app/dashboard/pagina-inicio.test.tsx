/**
 * /dashboard (app/(auth)/dashboard/page.tsx): the sections come from the
 * person's facts and each one loads only when present.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const cargarHechosInicio = jest.fn()
const cargarGruposMiembro = jest.fn()
const cargarCumpleanosGrupos = jest.fn()
const cargarTablero = jest.fn()
const cargarVisionGeneral = jest.fn()
const cargarACargo = jest.fn()
const cargarMisHijosDashboard = jest.fn()
const cargarMisServiciosPanel = jest.fn()
const cargarNotasLideres = jest.fn()
const getUser = jest.fn()
const supabase = { auth: { getUser } }
const redirect = jest.fn((ruta: string) => {
  throw new Error(`redirect ${ruta}`)
})

jest.mock('next/navigation', () => ({ redirect: (ruta: string) => redirect(ruta) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => supabase }))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: 'Carlos Mendoza' }, error: null }) }) }) }),
  }),
}))
jest.mock('@/lib/inicio/cargar-hechos', () => ({ cargarHechosInicio: (...a: unknown[]) => cargarHechosInicio(...a) }))
jest.mock('@/lib/inicio/cargar-grupos-miembro', () => ({ cargarGruposMiembro: (...a: unknown[]) => cargarGruposMiembro(...a) }))
jest.mock('@/lib/inicio/cargar-cumpleanos', () => ({
  ...jest.requireActual('@/lib/inicio/cargar-cumpleanos'),
  cargarCumpleanosGrupos: (...a: unknown[]) => cargarCumpleanosGrupos(...a),
}))
jest.mock('@/app/(auth)/dashboard/tablero', () => ({
  cargarTablero: () => cargarTablero(),
  cargarVisionGeneral: (...a: unknown[]) => cargarVisionGeneral(...a),
}))
jest.mock('@/lib/inicio/cargar-a-cargo', () => ({ ...jest.requireActual('@/lib/inicio/cargar-a-cargo'), cargarACargo: (...a: unknown[]) => cargarACargo(...a) }))
jest.mock('@/lib/inicio/cargar-notas-lideres', () => ({ cargarNotasLideres: (...a: unknown[]) => cargarNotasLideres(...a) }))
jest.mock('@/app/(auth)/dashboard/mis-hijos-dashboard', () => ({ cargarMisHijosDashboard: () => cargarMisHijosDashboard() }))
jest.mock('@/components/mis-servicios/cargar-mis-servicios', () => ({ cargarMisServiciosPanel: () => cargarMisServiciosPanel() }))
jest.mock('@/components/mis-servicios/tarjeta-mis-servicios', () => ({
  TarjetaMisServicios: ({ inicial }: { inicial: { porResponder: number } }) => <h2>Mis servicios · {inicial.porResponder}</h2>,
}))
jest.mock('@/components/dashboard/TarjetaMisHijosDashboard', () => ({ TarjetaMisHijosDashboard: () => <h2>Mis hijos</h2> }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  PaginaSistema: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

import PaginaInicio from '@/app/(auth)/dashboard/page'

const hechos = (h: Partial<HechosInicio>): HechosInicio => ({ ...HECHOS_VACIOS, usuarioId: 'u-1', ...h })

describe('PaginaInicio', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
    cargarGruposMiembro.mockResolvedValue({})
    cargarCumpleanosGrupos.mockResolvedValue([])
    cargarTablero.mockResolvedValue({ rol: 'miembro', widgets: {}, campusId: null, contextos: null })
    cargarVisionGeneral.mockResolvedValue(null)
    cargarACargo.mockResolvedValue([])
    cargarMisHijosDashboard.mockResolvedValue(null)
    cargarMisServiciosPanel.mockResolvedValue(null)
    cargarNotasLideres.mockResolvedValue([])
  })

  it('miembro de un grupo: carga su grupo y no el tablero', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios', rol: 'Miembro' }], hizoProximoPaso: false }))

    render(await PaginaInicio())

    expect(screen.getAllByRole('heading', { level: 1, name: 'Hola, Carlos' }).length).toBeGreaterThan(0)
    expect(cargarGruposMiembro).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ authId: 'auth-1', usuarioId: 'u-1', grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios' }] }))
    expect(cargarTablero).not.toHaveBeenCalled()
    expect(cargarACargo).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Mi grupo de vida' })).toBeInTheDocument()
  })

  it('miembro: los cumpleaños de su grupo, sin leer el tablero (S14a)', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios', rol: 'Miembro' }] }))
    cargarCumpleanosGrupos.mockResolvedValue([{ id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-12', contexto: 'Matrimonios' }])

    render(await PaginaInicio())

    expect(cargarCumpleanosGrupos).toHaveBeenCalledWith(supabase, expect.objectContaining({ authId: 'auth-1', usuarioId: 'u-1', grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios' }] }))
    expect(cargarTablero).not.toHaveBeenCalled()
    const cumpleanos = screen.getByRole('region', { name: 'Próximos cumpleaños' })
    expect(within(cumpleanos).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(cumpleanos).getByText('Matrimonios')).toBeInTheDocument()
  })

  it('líder que además es miembro de otro grupo: una sección con ambos, sin repetir personas', async () => {
    cargarHechosInicio.mockResolvedValue(
      hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }, { grupoId: 'g-2', nombre: 'Matrimonios', rol: 'Miembro' }] }),
    )
    cargarTablero.mockResolvedValue({
      rol: 'lider',
      widgets: { proximos_cumpleanos_grupo: [{ id: 'u-9', nombre_completo: 'Ramón Pérez', proximo: '2026-11-12' }] },
      campusId: null,
      contextos: null,
    })
    cargarCumpleanosGrupos.mockResolvedValue([
      { id: 'u-9', nombre: 'Ramón Pérez', fecha: '2026-11-12', contexto: 'Matrimonios' },
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-13', contexto: 'Matrimonios' },
    ])

    render(await PaginaInicio())

    expect(cargarCumpleanosGrupos).toHaveBeenCalledWith(supabase, expect.objectContaining({ grupos: [{ grupoId: 'g-2', nombre: 'Matrimonios' }] }))
    expect(screen.getAllByRole('region', { name: 'Próximos cumpleaños' })).toHaveLength(1)
    const filas = within(screen.getByRole('region', { name: 'Próximos cumpleaños' })).getAllByRole('listitem')
    expect(filas.map((f) => f.textContent)).toEqual([expect.stringContaining('Ramón Pérez'), expect.stringContaining('Ana Pérez')])
    expect(filas[0]).toHaveTextContent('Hombres +36')
  })

  it('directora de etapa sin grupo propio no pide cumpleaños de grupos', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ etapasDirigidas: ['sl-1'] }))

    render(await PaginaInicio())

    expect(cargarCumpleanosGrupos).not.toHaveBeenCalled()
  })

  it('admin: carga la visión del campus con sus grupos sin casa y los contextos', async () => {
    const tablero = { rol: 'admin', widgets: {}, campusId: null, contextos: <p>Contextos de la sesión</p> }
    cargarTablero.mockResolvedValue(tablero)
    cargarVisionGeneral.mockResolvedValue({ personas: 10, nuevos: 1, grupos: 2, asistencia: 70, dreamTeam: 3, tendencia: [], gruposEnRiesgo: [], gruposSinCasa: 4, postulados: 0 })
    cargarHechosInicio.mockResolvedValue(hechos({ esAdminOPastor: true, pendientes: { ...HECHOS_VACIOS.pendientes, gruposSinCasa: 4 } }))

    render(await PaginaInicio())

    expect(cargarVisionGeneral).toHaveBeenCalledWith(supabase, tablero, 4)
    expect(cargarACargo).not.toHaveBeenCalled()
    expect(cargarGruposMiembro).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Visión general' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Visión general' })).getByText('Contextos de la sesión')).toBeInTheDocument()
  })

  it('líder: carga sus cargos y muestra su grupo', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }] }))
    cargarACargo.mockResolvedValue([
      { tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36', proximaReunion: null, lugar: null, miembros: 12, ultimaReunion: null, ausentes: [], nuevos: 0 },
    ])

    render(await PaginaInicio())

    expect(cargarACargo).toHaveBeenCalledWith(supabase, {
      authId: 'auth-1',
      usuarioId: 'u-1',
      hoy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      cargos: [{ tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' }],
    })
    expect(cargarVisionGeneral).not.toHaveBeenCalled()
    expect(cargarNotasLideres).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo que lidero' })).toBeInTheDocument()
  })

  it('líder: los cumpleaños de su grupo en su propia sección, con el grupo como contexto (S12)', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }] }))
    cargarTablero.mockResolvedValue({
      rol: 'lider',
      widgets: { proximos_cumpleanos_grupo: [{ id: 'u-9', nombre_completo: 'Ramón Pérez', proximo: '2026-11-12' }] },
      campusId: null,
      contextos: null,
    })

    render(await PaginaInicio())

    const cumpleanos = screen.getByRole('region', { name: 'Próximos cumpleaños' })
    expect(within(cumpleanos).getByText('Ramón Pérez')).toBeInTheDocument()
    expect(within(cumpleanos).getByText('Hombres +36')).toBeInTheDocument()
  })

  it('directora de etapa: carga las notas de líderes y los cumpleaños de su alcance (S11, S12)', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ etapasDirigidas: ['sl-1'] }))
    cargarTablero.mockResolvedValue({
      rol: 'director-etapa',
      widgets: { proximos_cumpleanos_alcance: [{ id: 'u-9', nombre_completo: 'Gladys Piña', proximo: '2026-11-12' }] },
      campusId: null,
      contextos: null,
    })
    cargarNotasLideres.mockResolvedValue([
      { eventoId: 'e-1', grupoId: 'g-1', grupo: 'El Ujano', nota: 'Oramos por Gladys', lider: 'Yelitza Rodríguez', presentes: 9, total: 12, fecha: '2026-11-05' },
    ])

    render(await PaginaInicio())

    expect(cargarNotasLideres).toHaveBeenCalledWith(supabase, 'auth-1')
    expect(within(screen.getByRole('region', { name: 'Notas de líderes' })).getByText('Oramos por Gladys')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Próximos cumpleaños' })).getByText('Gladys Piña')).toBeInTheDocument()
  })

  it('si las notas no cargan, solo se oculta ese bloque; si el tablero falla, solo los cumpleaños', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ segmentosDirigidos: ['seg-1'] }))
    cargarTablero.mockResolvedValue({ rol: 'director-general', widgets: { proximos_cumpleanos: [{ id: 'u-9', nombre_completo: 'Ana Pérez', proximo: '2026-11-12' }] }, campusId: null, contextos: null })
    cargarNotasLideres.mockResolvedValue([])

    const { unmount } = render(await PaginaInicio())

    expect(screen.queryByRole('region', { name: 'Notas de líderes' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Próximos cumpleaños' })).toBeInTheDocument()
    unmount()

    cargarTablero.mockResolvedValue(null)
    cargarNotasLideres.mockResolvedValue([
      { eventoId: 'e-1', grupoId: 'g-1', grupo: 'El Ujano', nota: 'Oramos por Gladys', lider: null, presentes: null, total: null, fecha: '2026-11-05' },
    ])

    render(await PaginaInicio())

    expect(screen.getByRole('region', { name: 'Notas de líderes' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Próximos cumpleaños' })).not.toBeInTheDocument()
  })

  it('si el tablero no carga, los cargos y el resto siguen', async () => {
    cargarTablero.mockResolvedValue(null)
    cargarHechosInicio.mockResolvedValue(hechos({ etapasDirigidas: ['sl-1'] }))
    cargarACargo.mockResolvedValue([null])

    render(await PaginaInicio())

    expect(screen.queryByRole('heading', { name: /Mi etapa/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Explorar' })).toBeInTheDocument()
  })

  it('con hijos muestra la tarjeta de Mis hijos', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ hijos: 1 }))
    cargarMisHijosDashboard.mockResolvedValue({ hijos: [{ id: 'n-1', nombre: 'Sofía' }], prechecks: {} })

    render(await PaginaInicio())

    expect(screen.getByRole('heading', { level: 2, name: 'Mis hijos' })).toBeInTheDocument()
  })

  it('convocado en DPS: muestra Mis servicios en su lugar y lo suma a Para responder (S2)', async () => {
    cargarMisServiciosPanel.mockResolvedValue({ servicios: [{}], avisos: [], porResponder: 2, fechasBloqueadas: 0 })
    cargarHechosInicio.mockResolvedValue(hechos({ pendientes: { ...HECHOS_VACIOS.pendientes, solicitudesGrupo: 1 } }))

    const { container } = render(await PaginaInicio())

    const ranura = container.querySelector('#mis-servicios') as HTMLElement
    expect(within(ranura).getByRole('heading', { level: 2, name: 'Mis servicios · 2' })).toBeInTheDocument()
    expect(container.querySelector('a[href="#mis-servicios"]')).not.toBeNull()
  })

  it('sin servicios ni avisos no muestra Mis servicios', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({}))

    render(await PaginaInicio())

    expect(screen.queryByRole('heading', { name: /Mis servicios/ })).toBeNull()
  })

  it('sin sesión va al login', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    await expect(PaginaInicio()).rejects.toThrow('redirect /login')
    expect(cargarHechosInicio).not.toHaveBeenCalled()
  })
})
