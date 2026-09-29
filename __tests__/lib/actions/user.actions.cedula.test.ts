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

type Guardado = { cedula: string | null; telefono: string | null }

function adminConUpdate(
  error: { code?: string; message: string; details?: string } | null,
  guardado: Guardado = { cedula: null, telefono: null },
) {
  const single = jest.fn().mockResolvedValue({ data: error ? null : { id: 'u-1' }, error })
  const select = jest.fn().mockReturnValue({ single })
  const eq = jest.fn().mockReturnValue({ select })
  const update = jest.fn().mockReturnValue({ eq })
  // The profile is read first (cedula and telefono as stored) to know what changed.
  const singleGuardado = jest.fn().mockResolvedValue({ data: guardado, error: null })
  const eqGuardado = jest.fn().mockReturnValue({ single: singleGuardado })
  const selectGuardado = jest.fn().mockReturnValue({ eq: eqGuardado })
  return { admin: { from: jest.fn().mockReturnValue({ update, select: selectGuardado }) }, update }
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

  it('does not send the cedula when saving another field of a profile whose stored cedula is not canonical', async () => {
    const { admin, update } = adminConUpdate(
      { message: 'stop' },
      { cedula: '7.485477 ', telefono: null },
    )
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(
      updateUser('u-1', { ...datosBase, nombre: 'Mireya', cedula: '7.485477 ' }),
    ).rejects.toThrow()

    const enviado = update.mock.calls[0][0]
    expect(enviado).toEqual(expect.objectContaining({ nombre: 'Mireya' }))
    expect(enviado).not.toHaveProperty('cedula')
  })

  it('sends the cedula when it really changed, normalized', async () => {
    const { admin, update } = adminConUpdate({ message: 'stop' }, { cedula: '7485477', telefono: null })
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, cedula: 'V-22.328.215' })).rejects.toThrow()

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ cedula: '22328215' }))
  })

  it('sends null when the cedula is cleared', async () => {
    const { admin, update } = adminConUpdate({ message: 'stop' }, { cedula: '7485477', telefono: null })
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, cedula: '  ' })).rejects.toThrow()

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ cedula: null }))
  })

  it('does not send the telefono when it did not change', async () => {
    const { admin, update } = adminConUpdate(
      { message: 'stop' },
      { cedula: null, telefono: '0414 555 0003' },
    )
    createSupabaseAdminClient.mockReturnValue(admin)

    await expect(updateUser('u-1', { ...datosBase, telefono: '0414 555 0003' })).rejects.toThrow()

    expect(update.mock.calls[0][0]).not.toHaveProperty('telefono')
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

describe('an unrecognized cedula typed with surrounding spaces', () => {
  beforeEach(() => createSupabaseAdminClient.mockReset())

  it('is stored trimmed and identical by createUser and updateUser', async () => {
    const creado = adminConInsert({ message: 'stop' })
    createSupabaseAdminClient.mockReturnValue(creado.admin)
    await createUser({ ...datosBase, cedula: '  ABC123  ' })
    expect(creado.insert).toHaveBeenCalledWith(expect.objectContaining({ cedula: 'ABC123' }))

    const actualizado = adminConUpdate({ message: 'stop' })
    createSupabaseAdminClient.mockReturnValue(actualizado.admin)
    await expect(updateUser('u-1', { ...datosBase, cedula: '  ABC123  ' })).rejects.toThrow()
    expect(actualizado.update).toHaveBeenCalledWith(expect.objectContaining({ cedula: 'ABC123' }))
  })
})
