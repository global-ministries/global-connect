/**
 * @jest-environment node
 *
 * Dream Team — GET /api/dream-team/usuarios/posibles-duplicados (T4, S6b):
 * who may already be the person about to be registered. Same chain as the
 * cédula lookup: flag (404), session (401), the RPC's own gate
 * (personas_posibles_duplicados, 42501 → 403); 400 without nombre or
 * apellido; never leaks a database error.
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))

import { GET } from '@/app/api/dream-team/usuarios/posibles-duplicados/route'

const crearCliente = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolverSesion = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

let rpc: jest.Mock

function setup({ enabled = true, user = { id: 'auth-1' } as { id: string } | null, data = [] as unknown, error = null as unknown } = {}) {
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = enabled ? 'on' : 'off'
  rpc = jest.fn().mockResolvedValue({ data, error })
  crearCliente.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc,
  })
  resolverSesion.mockReset().mockResolvedValue(
    user ? { personaId: 'p-1', subjectAuthId: user.id, globalRoles: [], contexts: [], capabilities: [] } : null,
  )
}

const get = (q: string) => GET(new NextRequest(new URL(`http://localhost/api/dream-team/usuarios/posibles-duplicados?${q}`)))

describe('GET /api/dream-team/usuarios/posibles-duplicados', () => {
  it('404 when the Dream Team flag is off', async () => {
    setup({ enabled: false })
    expect((await get('nombre=Ana&apellido=Perez')).status).toBe(404)
  })

  it('401 without a session', async () => {
    setup({ user: null })
    expect((await get('nombre=Ana&apellido=Perez')).status).toBe(401)
  })

  it('400 without nombre or apellido, no RPC call', async () => {
    setup()
    const res = await get('nombre=Ana')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Nombre y apellido son requeridos' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('200 with the mapped people, calling the RPC with the typed data', async () => {
    setup({
      data: [{ id: 'u1', nombre: 'Isaac José', apellido: 'Paez Cordero', campus: 'Valencia', servicios: 1, tiene_cuenta: true, coincide: ['nombre'] }],
    })
    const res = await get('nombre=Isaac&apellido=Paez&cedula=V-12.345.678&telefono=0414%20123%204567')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      personas: [
        { id: 'u1', nombre: 'Isaac José', apellido: 'Paez Cordero', nombreCorto: 'Isaac Paez', campus: 'Valencia', servicios: 1, tieneCuenta: true, coincide: ['nombre'] },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('personas_posibles_duplicados', {
      p_nombre: 'Isaac',
      p_apellido: 'Paez',
      p_cedula: '12345678',
      p_telefono: '0414 123 4567',
    })
  })

  it('403 when the RPC refuses the caller', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    const res = await get('nombre=Ana&apellido=Perez')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Permiso denegado' })
  })

  it('500 with a generic message on any other error', async () => {
    setup({ error: { code: 'XX000', message: 'boom detail' } })
    const consola = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await get('nombre=Ana&apellido=Perez')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Error interno' })
    consola.mockRestore()
  })
})
