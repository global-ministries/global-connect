/**
 * updateUser for Editar persona (S14 of odd/tasks/sistema-diseno-v2.md):
 * decision 5 (the address is optional; calle is required only when another
 * address field is filled; an empty address is never written), decision 4
 * (a duplicated cédula comes back as a field error) and the phone, compared
 * in its canonical form (the DB trigger normalizar_telefono_ve stores it).
 */
import { redirect } from 'next/navigation'

import { updateUser } from '@/lib/actions/user.actions'

const createSupabaseAdminClient = jest.fn()
const permiso = jest.fn()

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ authId: 'auth-1' }) }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: async () => permiso() }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

type Fila = Record<string, unknown>

/** An admin client with `usuarios` (stored row + update result) and `direcciones` (upsert). */
function admin({ guardado = {}, errorUpdate = null }: { guardado?: Fila; errorUpdate?: Fila | null } = {}) {
  const fila: Fila = { cedula: null, telefono: null, direccion_id: null, familia_id: null, ...guardado }
  const update = jest.fn((_cambios: Fila) => ({
    eq: () => {
      const resultado = { data: errorUpdate ? null : { id: 'u-1' }, error: errorUpdate }
      return { select: () => ({ single: async () => resultado }), then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) }
    },
  }))
  const upsert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'dir-nueva' }, error: null }) }) }))
  const from = jest.fn((tabla: string) => {
    if (tabla === 'direcciones') return { upsert }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: fila, error: null }) }) }), update }
  })
  createSupabaseAdminClient.mockReturnValue({ from })
  return { from, update, upsert }
}

const BASE = { nombre: 'Beatriz', apellido: 'Paz', genero: 'Femenino', estado_civil: 'Soltero' } as const

beforeEach(() => {
  createSupabaseAdminClient.mockReset()
  permiso.mockReset().mockReturnValue({ data: true, error: null })
  jest.mocked(redirect).mockReset()
})

describe('updateUser: decision 5, the address is optional', () => {
  it('saves the person and writes no address when every address field is empty', async () => {
    const { from, update, upsert } = admin()

    const r = await updateUser('u-1', { ...BASE, direccion: { calle: '  ', parroquia_id: 'none', barrio: '' } }, true)

    expect(r).toEqual({ ok: true })
    expect(update).toHaveBeenCalledTimes(1)
    expect(upsert).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalledWith('direcciones')
  })

  it('saves the person without a direccion key at all', async () => {
    const { upsert } = admin()

    expect(await updateUser('u-1', { ...BASE }, true)).toEqual({ ok: true })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses another address field without calle as a field error, before writing anything', async () => {
    const { update, upsert } = admin()

    const r = await updateUser('u-1', { ...BASE, direccion: { calle: '', referencia: 'Frente a la plaza' } }, true)

    expect(r).toEqual({ ok: false, campo: 'calle', error: 'Escribe la calle para guardar la dirección.' })
    expect(update).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('PRESERVE: writes a complete address and links it to a person without one', async () => {
    const { update, upsert } = admin()

    await updateUser('u-1', { ...BASE, direccion: { calle: 'Calle 3', parroquia_id: 'pa-1', lat: 10.06, lng: -69.31 } }, true)

    expect(upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ calle: 'Calle 3', parroquia_id: 'pa-1', latitud: 10.06, longitud: -69.31 })],
      { onConflict: 'id' },
    )
    expect(update).toHaveBeenLastCalledWith({ direccion_id: 'dir-nueva' })
  })
})

describe('updateUser: decision 4, a duplicated cédula', () => {
  it('comes back as a field error on cedula', async () => {
    admin({
      errorUpdate: { code: '23505', message: 'duplicate key value violates unique constraint "usuarios_cedula_key"', details: 'Key (cedula)=(22328215) already exists.' },
    })

    const r = await updateUser('u-1', { ...BASE, cedula: '22328215' })

    expect(r).toEqual({ ok: false, campo: 'cedula', error: 'Esta cédula ya pertenece a otra persona.' })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('updateUser: success', () => {
  it('PRESERVE: goes to the ficha after saving from /users/[id]/edit', async () => {
    admin()
    await updateUser('u-1', { ...BASE })
    expect(redirect).toHaveBeenCalledWith('/users/u-1')
  })

  it('PRESERVE: stays (no redirect) when saving from /perfil', async () => {
    admin()
    expect(await updateUser('u-1', { ...BASE }, true)).toEqual({ ok: true })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('PRESERVE: still refuses a caller without puede_editar_usuario', async () => {
    const { update } = admin()
    permiso.mockReturnValue({ data: false, error: null })
    await expect(updateUser('u-1', { ...BASE })).rejects.toThrow('No tienes permisos para editar este usuario')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('updateUser: phone', () => {
  it('does not rewrite a stored canonical phone sent formatted', async () => {
    const { update } = admin({ guardado: { telefono: '04145523108' } })
    await updateUser('u-1', { ...BASE, telefono: '0414 552 3108' }, true)
    expect(update.mock.calls[0][0]).not.toHaveProperty('telefono')
  })

  it('sends a changed phone in its canonical form', async () => {
    const { update } = admin({ guardado: { telefono: '04145523108' } })
    await updateUser('u-1', { ...BASE, telefono: '+58 424 552 3108' }, true)
    expect(update.mock.calls[0][0]).toEqual(expect.objectContaining({ telefono: '04245523108' }))
  })
})
