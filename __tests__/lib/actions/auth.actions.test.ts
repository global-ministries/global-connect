import { signup } from '@/lib/actions/auth.actions'

const signUp = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
}))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))

function crearAdmin(existente: { id: string } | null) {
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

  it('looks up by email only when no cedula is given', async () => {
    const { admin, or } = crearAdmin({ id: 'perfil-3' })
    createSupabaseAdminClient.mockReturnValue(admin)

    await signup(formulario('   '))

    expect(or).toHaveBeenCalledWith('email.eq.bea@example.com')
  })

  it('links the auth_id to an existing profile even if it already had another one (unchanged behaviour)', async () => {
    const { admin, update } = crearAdmin({ id: 'perfil-4' })
    createSupabaseAdminClient.mockReturnValue(admin)

    const res = await signup(formulario('22.328.215'))

    expect(res.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ auth_id: 'auth-1' })
  })
})
