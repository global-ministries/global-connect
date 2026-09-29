import { signup } from '@/lib/actions/auth.actions'

const signUp = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

function crearAdmin(existente: { id: string; auth_id?: string | null } | null) {
  const or = jest.fn()
  const insert = jest.fn().mockResolvedValue({ error: null })
  const eq = jest.fn().mockResolvedValue({ error: null })
  const update = jest.fn().mockReturnValue({ eq })
  const limit = jest.fn().mockResolvedValue({ data: existente ? [existente] : [], error: null })
  or.mockReturnValue({ limit })
  const select = jest.fn().mockReturnValue({ or })
  const from = jest.fn().mockReturnValue({ select, update, insert })
  return { admin: { from }, or, insert, update, eq }
}

function formulario(cedula: string) {
  const fd = new FormData()
  fd.append('nombre', 'Beatriz')
  fd.append('apellido', 'Paz')
  fd.append('email', 'bea@example.com')
  fd.append('password', 'secreto123')
  fd.append('cedula', cedula)
  return fd
}

describe('signup: match a registering person by normalized cedula', () => {
  beforeEach(() => {
    signUp.mockReset()
    signUp.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    createSupabaseAdminClient.mockReset()
  })

  it.each(['22.328.215', 'V-22328215', 'v22328215', ' 22328215 ', '22328215'])(
    'looks the profile up by 22328215 when the person typed %j',
    async (escrito) => {
      const { admin, or, update, eq, insert } = crearAdmin({ id: 'perfil-1' })
      createSupabaseAdminClient.mockReturnValue(admin)

      const res = await signup(formulario(escrito))

      expect(res.success).toBe(true)
      expect(or).toHaveBeenCalledWith('email.eq.bea@example.com,cedula.eq.22328215')
      expect(update).toHaveBeenCalledWith({ auth_id: 'auth-1' })
      expect(eq).toHaveBeenCalledWith('id', 'perfil-1')
      expect(insert).not.toHaveBeenCalled()
    },
  )

  it('inserts the new profile with the normalized cedula', async () => {
    const { admin, insert } = crearAdmin(null)
    createSupabaseAdminClient.mockReturnValue(admin)

    const res = await signup(formulario('V-22.328.215'))

    expect(res.success).toBe(true)
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ auth_id: 'auth-1', email: 'bea@example.com', cedula: '22328215' }),
    ])
  })

  it('keeps an unrecognized value as typed, quoted so it cannot break the filter', async () => {
    const { admin, or } = crearAdmin({ id: 'perfil-2' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await signup(formulario('04245136686'))
    expect(or).toHaveBeenLastCalledWith('email.eq.bea@example.com,cedula.eq.04245136686')

    await signup(formulario('AB,C(1)'))
    expect(or).toHaveBeenLastCalledWith('email.eq.bea@example.com,cedula.eq."AB,C(1)"')
  })

  it('stores an unrecognized cedula trimmed, like createUser and updateUser do', async () => {
    const { admin, insert } = crearAdmin(null)
    createSupabaseAdminClient.mockReturnValue(admin)

    await signup(formulario('  ABC123  '))

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ cedula: 'ABC123' })])
  })

  it('stores a blank cedula as null', async () => {
    const { admin, insert } = crearAdmin(null)
    createSupabaseAdminClient.mockReturnValue(admin)

    await signup(formulario('   '))

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ cedula: null })])
  })

  it('looks up by email only when no cedula is given', async () => {
    const { admin, or } = crearAdmin({ id: 'perfil-3' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await signup(formulario('   '))

    expect(or).toHaveBeenCalledWith('email.eq.bea@example.com')
  })

  it('links the account to an existing profile that has no auth_id yet', async () => {
    const { admin, update, eq, insert } = crearAdmin({ id: 'perfil-4', auth_id: null })
    createSupabaseAdminClient.mockReturnValue(admin)

    const res = await signup(formulario('22.328.215'))

    expect(res.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ auth_id: 'auth-1' })
    expect(eq).toHaveBeenCalledWith('id', 'perfil-4')
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses to bind the account to a profile that already belongs to another account', async () => {
    const { admin, update, insert } = crearAdmin({ id: 'perfil-5', auth_id: 'auth-de-otra-persona' })
    createSupabaseAdminClient.mockReturnValue(admin)

    const res = await signup(formulario('22.328.215'))

    expect(res).toEqual({
      success: false,
      message: 'Ya existe una cuenta para esta persona. Inicia sesión o pide ayuda a un administrador.',
    })
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })

  it('is idempotent when the profile is already bound to this same account', async () => {
    const { admin, update, insert } = crearAdmin({ id: 'perfil-6', auth_id: 'auth-1' })
    createSupabaseAdminClient.mockReturnValue(admin)

    const res = await signup(formulario('22.328.215'))

    expect(res.success).toBe(true)
    expect(update).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
