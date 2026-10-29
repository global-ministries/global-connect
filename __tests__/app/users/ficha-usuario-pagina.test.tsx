/**
 * /users/[id] server page: loads the ficha as the caller and hands the tab,
 * the Asistencia range, the whole Grupos de Vida history, the servicios and
 * (admin only) the auth id to the client. /users/[id]/asistencia redirects
 * to the Asistencia tab, keeping its old date params.
 */
import type { ReactElement } from 'react'

const redirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`)
})
jest.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: jest.fn(), from: jest.fn() }) }))
const authAdmin = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => authAdmin() }) }) }),
  }),
}))
let roles = ['admin']
jest.mock('@/lib/getUserWithRoles', () => ({
  getUserWithRoles: async () => ({ user: { id: 'auth-1' }, roles, platformSession: { personaId: 'u-1' } }),
}))
const cargarFicha = jest.fn()
jest.mock('@/lib/platform/usuarios/ficha-persona', () => ({ cargarFichaPersona: (...a: unknown[]) => cargarFicha(...a) }))
const cargarAsistencia = jest.fn()
jest.mock('@/lib/platform/usuarios/asistencia-persona', () => ({ cargarAsistenciaPersona: (...a: unknown[]) => cargarAsistencia(...a) }))
jest.mock('@/lib/platform/usuarios/ficha-servicio', () => ({ cargarServiciosPersona: async () => [{ id: 's1' }] }))
jest.mock('@/components/users/ficha/ficha-usuario', () => ({ FichaUsuario: () => null }))
jest.mock('@/components/users/ficha/estado-ficha', () => ({ ErrorFicha: () => null }))

import PaginaFichaUsuario from '@/app/(auth)/users/[id]/page'
import AsistenciaUsuarioPage from '@/app/(auth)/users/[id]/asistencia/page'

const persona = { id: 'u-2', nombre: 'Ana', apellido: 'Pérez' }
const gdvActual = { tipo: 'gdv', id: 'g-1', actual: true }

beforeEach(() => {
  roles = ['admin']
  cargarFicha.mockResolvedValue({ ok: true, persona, puedeEditar: true, resumen: { cuenta: 'si' } })
  cargarAsistencia.mockImplementation(async (_s: unknown, c: { desde?: string }) =>
    c.desde === '1900-01-01'
      ? { desde: c.desde, hasta: '2026-10-29', grupos: [gdvActual, { tipo: 'estudiantes', id: 'e-1', actual: true }] }
      : { desde: c.desde ?? '2025-10-29', hasta: '2026-10-29', grupos: [] },
  )
  authAdmin.mockResolvedValue({ data: { auth_id: 'auth-2' }, error: null })
})

async function props(searchParams: Record<string, string> = {}) {
  const el = (await PaginaFichaUsuario({ params: Promise.resolve({ id: 'u-2' }), searchParams: Promise.resolve(searchParams) })) as ReactElement<Record<string, unknown>>
  return el.props
}

describe('/users/[id] page', () => {
  it('hands the tab and the range to the ficha', async () => {
    const p = await props({ tab: 'asistencia', desde: '2026-08-01', hasta: '2026-10-29' })
    expect(p.tabInicial).toBe('asistencia')
    expect(cargarAsistencia).toHaveBeenCalledWith(expect.anything(), { usuarioId: 'u-2', authId: 'auth-1', desde: '2026-08-01', hasta: '2026-10-29' })
    expect(p.visor).toEqual({ roles: ['admin'], usuarioId: 'u-1' })
    expect(p.puedeEditar).toBe(true)
    expect(p.servicios).toEqual([{ id: 's1' }])
  })

  it('lists only Grupos de Vida, from the whole history', async () => {
    const p = await props()
    expect(p.grupos).toEqual([gdvActual])
  })

  it('loads the auth id for admin only', async () => {
    expect((await props()).authIdPersona).toBe('auth-2')
    roles = ['pastor']
    expect((await props()).authIdPersona).toBeUndefined()
  })

  it('passes null when attendance is not visible', async () => {
    cargarAsistencia.mockResolvedValue(null)
    const p = await props()
    expect(p.asistencia).toBeNull()
    expect(p.grupos).toBeNull()
  })

  it('renders the error state when the ficha cannot load', async () => {
    cargarFicha.mockResolvedValue({ ok: false, motivo: 'sin-permiso', mensaje: 'No tienes permiso para ver esta ficha.' })
    const p = await props()
    expect(p).toMatchObject({ motivo: 'sin-permiso', reintentarHref: '/users/u-2' })
  })
})

describe('/users/[id]/asistencia', () => {
  it('redirects to the Asistencia tab', async () => {
    await expect(AsistenciaUsuarioPage({ params: Promise.resolve({ id: 'u-2' }), searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/users/u-2?tab=asistencia',
    )
  })

  it('keeps the old date params as Desde/Hasta', async () => {
    await expect(
      AsistenciaUsuarioPage({ params: Promise.resolve({ id: 'u-2' }), searchParams: Promise.resolve({ fecha_inicio: '2026-01-01', fecha_fin: '2026-03-01' }) }),
    ).rejects.toThrow('redirect:/users/u-2?tab=asistencia&desde=2026-01-01&hasta=2026-03-01')
  })
})
