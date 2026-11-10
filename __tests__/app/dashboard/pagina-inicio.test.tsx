/**
 * /dashboard (app/(auth)/dashboard/page.tsx): the sections come from the
 * person's facts and each one loads only when present.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const cargarHechosInicio = jest.fn()
const cargarGruposMiembro = jest.fn()
const cargarTableroAnterior = jest.fn()
const cargarMisHijosDashboard = jest.fn()
const getUser = jest.fn()
const redirect = jest.fn((ruta: string) => {
  throw new Error(`redirect ${ruta}`)
})

jest.mock('next/navigation', () => ({ redirect: (ruta: string) => redirect(ruta) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser } }) }))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: 'Carlos Mendoza' }, error: null }) }) }) }),
  }),
}))
jest.mock('@/lib/inicio/cargar-hechos', () => ({ cargarHechosInicio: (...a: unknown[]) => cargarHechosInicio(...a) }))
jest.mock('@/lib/inicio/cargar-grupos-miembro', () => ({ cargarGruposMiembro: (...a: unknown[]) => cargarGruposMiembro(...a) }))
jest.mock('@/app/(auth)/dashboard/tablero-anterior', () => ({ cargarTableroAnterior: (...a: unknown[]) => cargarTableroAnterior(...a) }))
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
    cargarTableroAnterior.mockResolvedValue({})
    cargarMisHijosDashboard.mockResolvedValue(null)
  })

  it('miembro de un grupo: carga su grupo y no el tablero anterior', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios', rol: 'Miembro' }], hizoProximoPaso: false }))

    render(await PaginaInicio())

    expect(screen.getAllByRole('heading', { level: 1, name: 'Hola, Carlos' }).length).toBeGreaterThan(0)
    expect(cargarGruposMiembro).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ authId: 'auth-1', usuarioId: 'u-1', grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios' }] }))
    expect(cargarTableroAnterior).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Mi grupo de vida' })).toBeInTheDocument()
  })

  it('admin: carga el tablero anterior solo para Visión general', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ esAdminOPastor: true }))
    cargarTableroAnterior.mockResolvedValue({ visionGeneral: <p>Panel del campus</p> })

    render(await PaginaInicio())

    expect(cargarTableroAnterior).toHaveBeenCalledWith({ cargos: null, conVision: true })
    expect(cargarGruposMiembro).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Visión general' })).toBeInTheDocument()
    expect(screen.getByText('Panel del campus')).toBeInTheDocument()
  })

  it('líder: pasa sus cargos al tablero anterior', async () => {
    cargarHechosInicio.mockResolvedValue(hechos({ grupos: [{ grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' }] }))
    cargarTableroAnterior.mockResolvedValue({ aCargo: <p>Tablero del líder</p> })

    render(await PaginaInicio())

    expect(cargarTableroAnterior).toHaveBeenCalledWith({ cargos: [{ tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' }], conVision: false })
    expect(screen.getByRole('heading', { level: 2, name: 'A tu cargo' })).toBeInTheDocument()
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
