/**
 * /dashboard (app/(auth)/dashboard/page.tsx) — T8 of odd/tasks/proximo-paso.md
 * (design/proximo-paso 08–09): whoever is asked for Próximo Paso gets the live
 * card inside «Tus próximos pasos», loaded with the person's own client; who
 * already did it loads nothing and sees no card; a failed read keeps the
 * static highlight.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { HECHOS_VACIOS, type HechosInicio } from '@/lib/inicio/hechos'

const cargarHechosInicio = jest.fn()
const cargarEstadoProximoPaso = jest.fn()
const isTalleresEnabled = jest.fn()
const getUser = jest.fn()
const supabase = { auth: { getUser } }

jest.mock('next/navigation', () => ({ redirect: (ruta: string) => { throw new Error(`redirect ${ruta}`) } }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => supabase }))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: 'Daniela Rojas' }, error: null }) }) }) }),
  }),
}))
jest.mock('@/lib/inicio/cargar-hechos', () => ({ cargarHechosInicio: (...a: unknown[]) => cargarHechosInicio(...a) }))
jest.mock('@/lib/inicio/cargar-grupos-miembro', () => ({ cargarGruposMiembro: async () => ({}) }))
jest.mock('@/lib/inicio/cargar-notas-lideres', () => ({ cargarNotasLideres: async () => [] }))
jest.mock('@/lib/inicio/cargar-a-cargo', () => ({ ...jest.requireActual('@/lib/inicio/cargar-a-cargo'), cargarACargo: async () => [] }))
jest.mock('@/app/(auth)/dashboard/tablero', () => ({ cargarTablero: async () => null, cargarVisionGeneral: async () => null }))
jest.mock('@/app/(auth)/dashboard/mis-hijos-dashboard', () => ({ cargarMisHijosDashboard: async () => null }))
jest.mock('@/components/mis-servicios/cargar-mis-servicios', () => ({ cargarMisServiciosPanel: async () => null }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-11' }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => isTalleresEnabled() }))
jest.mock('@/lib/platform/proximo-paso/estado', () => ({
  ...jest.requireActual('@/lib/platform/proximo-paso/estado'),
  cargarEstadoProximoPaso: (...a: unknown[]) => cargarEstadoProximoPaso(...a),
}))
jest.mock('@/components/dashboard/tarjeta-proximo-paso', () => ({
  TarjetaProximoPaso: ({ estado, hoy, nombre }: { estado: { variante: string }; hoy: string; nombre: string | null }) => (
    <article aria-label="Tarjeta Próximo Paso">{`${estado.variante} · ${hoy} · ${nombre}`}</article>
  ),
}))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  PaginaSistema: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

import PaginaInicio from '@/app/(auth)/dashboard/page'

const hechos = (h: Partial<HechosInicio>): HechosInicio => ({ ...HECHOS_VACIOS, usuarioId: 'u-1', ...h })
const SIN_FECHAS = { ediciones: [], inscripcion: null }

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  isTalleresEnabled.mockReturnValue(true)
  cargarEstadoProximoPaso.mockResolvedValue(SIN_FECHAS)
})

it('loads Próximo Paso for whoever has not done it and shows the card inside «Tus próximos pasos»', async () => {
  cargarHechosInicio.mockResolvedValue(hechos({ hizoProximoPaso: false }))

  render(await PaginaInicio())

  expect(cargarEstadoProximoPaso).toHaveBeenCalledWith(supabase, { usuarioId: 'u-1', hoy: '2026-11-11' })
  const seccion = screen.getByRole('region', { name: 'Tus próximos pasos' })
  expect(within(seccion).getByRole('article', { name: 'Tarjeta Próximo Paso' })).toHaveTextContent('sin-fecha · 2026-11-11 · Daniela')
  expect(screen.queryByRole('article', { name: 'Próximo Paso' })).not.toBeInTheDocument()
})

it('loads nothing and shows no card once the person did Próximo Paso', async () => {
  cargarHechosInicio.mockResolvedValue(hechos({ hizoProximoPaso: true }))

  render(await PaginaInicio())

  expect(cargarEstadoProximoPaso).not.toHaveBeenCalled()
  expect(screen.queryByRole('article', { name: 'Tarjeta Próximo Paso' })).not.toBeInTheDocument()
})

it('keeps the static highlight when the read fails or talleres are off', async () => {
  cargarHechosInicio.mockResolvedValue(hechos({ hizoProximoPaso: false }))
  cargarEstadoProximoPaso.mockRejectedValueOnce(new Error('down'))

  render(await PaginaInicio())
  expect(screen.getByRole('article', { name: 'Próximo Paso' })).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'Tarjeta Próximo Paso' })).not.toBeInTheDocument()

  isTalleresEnabled.mockReturnValue(false)
  cargarEstadoProximoPaso.mockClear()
  render(await PaginaInicio())
  expect(cargarEstadoProximoPaso).not.toHaveBeenCalled()
})
