import { createUser, updateUser } from '@/lib/actions/user.actions'

const createSupabaseAdminClient = jest.fn()

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ authId: 'auth-1' }) }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ rpc: async () => ({ data: true, error: null }) }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

const MENSAJE_DUPLICADA = 'Esta cédula ya pertenece a otra persona.'

function adminConInsert(error: { code?: string; message: string; details?: string } | null) {
  const single = jest.fn().mockResolvedValue({ data: error ? null : { id: 'nuevo' }, error })
  const select = jest.fn().mockReturnValue({ single })
  const insert = jest.fn().mockReturnValue({ select })
  return { admin: { from: jest.fn().mockReturnValue({ insert }) }, insert }
}

function adminConUpdate(error: { code?: string; message: string; details?: string } | null) {
  const single = jest.fn().mockResolvedValue({ data: error ? null : { id: 'u-1' }, error })
  const select = jest.fn().mockReturnValue({ single })
  const eq = jest.fn().mockReturnValue({ select })
  const update = jest.fn().mockReturnValue({ eq })
  return { admin: { from: jest.fn().mockReturnValue({ update }) }, update }
}

const datosBase = { nombre: 'Beatriz', apellido: 'Paz', genero: 'Femenino', estado_civil: 'Soltero' } as const

describe('createUser: cedula', () => {
  beforeEach(() => createSupabaseAdminClient.mockReset())

  it.each([
    ['22.328.215', '22328215'],
    ['V-18423291', '18423291'],
    ['E 81110494', 'E81110494'],
    ['04245136686', '04245136686'],
  ])('saves %j as %j', async (escrita, guardada) => {
    const { admin, insert } = adminConInsert({ message: 'stop' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await createUser({ ...datosBase, cedula: escrita })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ cedula: guardada }))
  })

  it('keeps a blank cedula as null', async () => {
    const { admin, insert } = adminConInsert({ message: 'stop' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await createUser({ ...datosBase, cedula: '   ' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ cedula: null }))
  })

  it.each(['usuarios_cedula_key', 'unique_cedula_nonnull'])(
    'maps a unique violation on %s to a clear message',
    async (restriccion) => {
      const { admin } = adminConInsert({
        code: '23505',
        message: `duplicate key value violates unique constraint "${restriccion}"`,
        details: 'Key (cedula)=(22328215) already exists.',
      })
      createSupabaseAdminClient.mockReturnValue(admin)

      const res = await createUser({ ...datosBase, cedula: '22.328.215' })

      expect(res).toEqual({ ok: false, error: MENSAJE_DUPLICADA })
    },
  )
})

describe('updateUser: cedula', () => {
  beforeEach(() => createSupabaseAdminClient.mockReset())

  it('saves the normalized cedula', async () => {
    const { admin, update } = adminConUpdate({ message: 'stop' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, cedula: 'V-22.328.215' })).rejects.toThrow()

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ cedula: '22328215' }))
  })

  it('maps a unique violation on the cedula to a clear message', async () => {
    const { admin } = adminConUpdate({
      code: '23505',
      message: 'duplicate key value violates unique constraint "usuarios_cedula_key"',
      details: 'Key (cedula)=(22328215) already exists.',
    })
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, cedula: '22328215' })).rejects.toThrow(MENSAJE_DUPLICADA)
  })

  it('does not map other update errors', async () => {
    const { admin } = adminConUpdate({ code: '23502', message: 'null value' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, cedula: '22328215' })).rejects.toThrow(
      'Error al actualizar usuario: null value',
    )
  })
})
