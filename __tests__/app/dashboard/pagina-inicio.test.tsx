/**
 * /dashboard (app/(auth)/dashboard/page.tsx): the sections come from the
 * person's facts and each one loads only when present.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const cargarHechosInicio = jest.fn()
const cargarGruposMiembro = jest.fn()
const cargarTablero = jest.fn()
const cargarVisionGeneral = jest.fn()
const cargarACargo = jest.fn()
const cargarMisHijosDashboard = jest.fn()
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
jest.mock('@/app/(auth)/dashboard/tablero', () => ({
  cargarTablero: () => cargarTablero(),
  cargarVisionGeneral: (...a: unknown[]) => cargarVisionGeneral(...a),
}))
jest.mock('@/lib/inicio/cargar-a-cargo', () => ({ ...jest.requireActual('@/lib/inicio/cargar-a-cargo'), cargarACargo: (...a: unknown[]) => cargarACargo(...a) }))
jest.mock('@/app/(auth)/dashboard/mis-hijos-dashboard', () => ({ cargarMisHijosDashboard: () => cargarMisHijosDashboard() }))
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
    cargarTablero.mockResolvedValue({ rol: 'miembro', widgets: {}, campusId: null, contextos: null })
    cargarVisionGeneral.mockResolvedValue(null)
    cargarACargo.mockResolvedValue([])
    cargarMisHijosDashboard.mockResolvedValue(null)
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
      { tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36', proximaReunion: null, lugar: null, miembros: 12, ultimaReunion: null, ausentes: [], nuevos: 0, cumpleanos: [] },
    ])

    render(await PaginaInicio())

    expect(cargarACargo).toHaveBeenCalledWith(supabase, {
      authId: 'auth-1',
      usuarioId: 'u-1',
      hoy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      cargos: [{ tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' }],
      tablero: expect.any(Promise),
    })
    expect(cargarVisionGeneral).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Grupo que lidero' })).toBeInTheDocument()
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

  it('sin sesión va al login', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    await expect(PaginaInicio()).rejects.toThrow('redirect /login')
    expect(cargarHechosInicio).not.toHaveBeenCalled()
  })
})
