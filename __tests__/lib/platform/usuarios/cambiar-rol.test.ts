/**
 * The one client call to /api/usuarios/cambiar-rol, shared by the list's
 * "Seleccionar" mode and the ficha's Cuenta tab.
 */
import { cambiarRolUsuarios } from '@/lib/platform/usuarios/cambiar-rol'

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('cambiarRolUsuarios', () => {
  it('posts the ids and the role', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    await expect(cambiarRolUsuarios(['u-1', 'u-2'], 'lider')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/usuarios/cambiar-rol', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['u-1', 'u-2'], rol: 'lider' }),
    })
  })

  it('throws the server reason, or a generic one when there is none', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Sin permiso' }) })
    await expect(cambiarRolUsuarios(['u-1'], 'admin')).rejects.toThrow('Sin permiso')
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => Promise.reject(new Error('no json')) })
    await expect(cambiarRolUsuarios(['u-1'], 'admin')).rejects.toThrow('No se pudo cambiar el rol.')
  })
})
