/**
 * @jest-environment node
 *
 * Dream Team — GET/PATCH /api/dream-team/personas/[id]/ficha (T11; the login
 * email sync: odd/tasks/dream-team-pendientes-director.md, S8).
 */
import { inspect } from 'node:util'

import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({ resolveReadOnlyPlatformSession: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: jest.fn() }))

import { GET, PATCH } from '@/app/api/dream-team/personas/[id]/ficha/route'

const createClient = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSession = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FILA = {
  id: ID, nombre: 'Ana', apellido: 'Pérez', fecha_nacimiento: '1990-05-17', cedula: null,
  genero: 'Femenino', estado_civil: 'Casado', telefono: null, redes_sociales: null,
}
let rpc: jest.Mock

function setup(rpcAnswer: { data?: unknown; error?: unknown } = {}, user: object | null = { id: 'auth-1' }) {
  rpc = jest.fn().mockResolvedValue({ data: rpcAnswer.data ?? null, error: rpcAnswer.error ?? null })
  createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, rpc })
  resolveSession.mockResolvedValue(user ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] } : null)
}

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const url = new URL(`http://localhost/api/dream-team/personas/${ID}/ficha`)
const get = (id?: string) => GET(new NextRequest(url), ctx(id))
const patch = (body: unknown, id?: string) =>
  PATCH(new NextRequest(url, { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) }), ctx(id))

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

describe('GET /api/dream-team/personas/[id]/ficha', () => {
  it('404 when the flag is off', async () => {
    process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'off'; setup()
    expect((await get()).status).toBe(404)
  })
  it('401 without a session', async () => { setup({}, null); expect((await get()).status).toBe(401) })
  it('400 for a malformed id', async () => { setup(); expect((await get('nope')).status).toBe(400) })
  it('returns the ficha; the database decides who may read it', async () => {
    setup({ data: FILA })
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).ficha).toMatchObject({ id: ID, fechaNacimiento: '1990-05-17', estadoCivil: 'Casado' })
    expect(rpc).toHaveBeenCalledWith('dream_team_ficha_persona', { p_persona_id: ID })
  })
  it('403 when the RPC refuses', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    expect((await get()).status).toBe(403)
  })
})

describe('PATCH /api/dream-team/personas/[id]/ficha', () => {
  it('401 without a session', async () => { setup({}, null); expect((await patch({ genero: 'Femenino' })).status).toBe(401) })
  it('400 for an invalid body, without calling the RPC', async () => {
    setup()
    expect((await patch('{')).status).toBe(400)
    const res = await patch({ fechaNacimiento: '2999-01-01' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('La fecha de nacimiento no puede ser futura')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('sends only the keys present and returns the updated ficha', async () => {
    setup({ data: FILA })
    const res = await patch({ fechaNacimiento: '1990-05-17', cedula: 'V-20.111.222' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', {
      p_persona_id: ID,
      p_datos: { fecha_nacimiento: '1990-05-17', cedula: '20111222' },
    })
    expect((await res.json()).ficha.apellido).toBe('Pérez')
  })
  it('409 for a cedula another person holds', async () => {
    setup({ error: { code: '23505', message: 'cedula_duplicada' } })
    const res = await patch({ cedula: '12345678' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Esa cédula ya pertenece a otra persona')
  })
  it('sends the email in the RPC name, trimmed and lowercased (S3)', async () => {
    setup({ data: FILA })
    expect((await patch({ email: ' Ana@Example.TEST ' })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', { p_persona_id: ID, p_datos: { email: 'ana@example.test' } })
  })
  it('400 for a bad email, without calling the RPC', async () => {
    setup()
    const res = await patch({ email: 'sin-arroba' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribe un correo válido')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('403 with the S3 message when only an admin may change the email', async () => {
    setup({ error: { code: '42501', message: 'email_solo_admin' } })
    const res = await patch({ email: 'otra@example.test' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Solo un administrador puede cambiar el correo de quien ya tiene cuenta.')
  })
  it('409 for an email another person holds', async () => {
    setup({ error: { code: '23505', message: 'email_en_uso' } })
    const res = await patch({ email: 'otra@example.test' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ese correo ya lo usa otra persona.')
  })
  it('403 out of scope', async () => {
    setup({ error: { code: '42501', message: 'sin_autoridad' } })
    expect((await patch({ genero: 'Femenino' })).status).toBe(403)
  })
})

describe('PATCH email of a person with account: the login follows (S8)', () => {
  const createAdmin = jest.requireMock('@/lib/supabase/admin').createSupabaseAdminClient as jest.Mock

  const AUTH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const ANTES = { ...FILA, email: 'ana@vieja.test', tiene_cuenta: true, puede_editar_email: true }
  let updateUserById: jest.Mock
  let getUserById: jest.Mock
  let restaurar: jest.Mock
  let filtrosRestaurar: Array<[string, unknown]>

  /** The session RPCs answer by name; the admin client reads auth_id, updates auth and restores. */
  function setupCuenta(opts: {
    antes?: Record<string, unknown>
    editar?: { data?: unknown; error?: unknown }
    auth?: { error: unknown }
    authLanza?: boolean
    /** What auth.users holds when it is read again after a failure (default: the old email). */
    releer?: { data: unknown; error: unknown }
    restaurado?: { data: unknown; error: unknown }
  } = {}) {
    const antes = opts.antes ?? ANTES
    rpc = jest.fn().mockImplementation((fn: string, args: { p_datos?: Record<string, unknown> }) => {
      if (fn === 'dream_team_ficha_persona') return Promise.resolve({ data: antes, error: null })
      if (opts.editar?.error) return Promise.resolve({ data: null, error: opts.editar.error })
      return Promise.resolve({ data: opts.editar?.data ?? { ...antes, ...args.p_datos }, error: null })
    })
    createClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) }, rpc })
    resolveSession.mockResolvedValue({ personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] })

    updateUserById = opts.authLanza
      ? jest.fn().mockRejectedValue(new Error('fetch failed for nueva.secreta@ejemplo.test'))
      : jest.fn().mockResolvedValue({ data: { user: { id: AUTH_ID } }, error: opts.auth?.error ?? null })
    getUserById = jest.fn().mockResolvedValue(opts.releer ?? { data: { user: { id: AUTH_ID, email: 'ana@vieja.test' } }, error: null })
    filtrosRestaurar = []
    restaurar = jest.fn()
    const cadenaRestaurar = {
      eq: (columna: string, valor: unknown) => { filtrosRestaurar.push([columna, valor]); return cadenaRestaurar },
      select: () => Promise.resolve(opts.restaurado ?? { data: [{ id: ID }], error: null }),
    }
    const from = jest.fn().mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { auth_id: AUTH_ID }, error: null }) }) }),
      update: (valores: unknown) => { restaurar(valores); return cadenaRestaurar },
    }))
    createAdmin.mockReturnValue({ auth: { admin: { updateUserById, getUserById } }, from })
  }

  it('a non-admin (the database refuses) gets 403 and the admin client is never created', async () => {
    setupCuenta({
      antes: { ...ANTES, puede_editar_email: false },
      editar: { error: { code: '42501', message: 'email_solo_admin' } },
    })
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Solo un administrador puede cambiar el correo de quien ya tiene cuenta.')
    expect(createAdmin).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('an admin: the RPC saves first, then the login email changes to the same address', async () => {
    setupCuenta()
    const res = await patch({ email: ' Ana@Nueva.TEST ' })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', { p_persona_id: ID, p_datos: { email: 'ana@nueva.test' } })
    expect(updateUserById).toHaveBeenCalledTimes(1)
    expect(updateUserById).toHaveBeenCalledWith(AUTH_ID, { email: 'ana@nueva.test', email_confirm: true })
    expect(rpc.mock.invocationCallOrder.at(-1)!).toBeLessThan(updateUserById.mock.invocationCallOrder[0])
    expect(restaurar).not.toHaveBeenCalled()
    expect((await res.json()).ficha.email).toBe('ana@nueva.test')
  })

  it('the auth update fails: usuarios.email goes back to the previous one and the answer says so', async () => {
    setupCuenta({ auth: { error: { message: 'Service unavailable', status: 503 } } })
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('No se pudo cambiar el correo de inicio de sesión; no se guardó ningún cambio de correo.')
    expect(restaurar).toHaveBeenCalledWith({ email: 'ana@vieja.test' })
    // Only if it still holds the new email (never overwrites a later change).
    expect(filtrosRestaurar).toEqual([['id', ID], ['email', 'ana@nueva.test']])
  })

  it('an email auth already holds: restored and 409 with the uniqueness message', async () => {
    setupCuenta({ auth: { error: { code: 'email_exists', message: 'A user with this email address has already been registered', status: 422 } } })
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Ese correo ya lo usa otra persona.')
    expect(restaurar).toHaveBeenCalledWith({ email: 'ana@vieja.test' })
  })

  it('the restore fails too: 500, never a 200', async () => {
    setupCuenta({ auth: { error: { message: 'boom' } }, restaurado: { data: null, error: { message: 'down' } } })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No se pudo cambiar el correo de inicio de sesión ni restaurar el anterior. Avisa a soporte.')
  })

  it('other fields of the same PATCH stay saved when only the login sync fails', async () => {
    setupCuenta({ auth: { error: { message: 'boom' } } })
    const res = await patch({ telefono: '0414-1234567', email: 'ana@nueva.test' })
    expect(res.status).toBe(502)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', {
      p_persona_id: ID,
      p_datos: { telefono: '0414-1234567', email: 'ana@nueva.test' },
    })
    expect(restaurar).toHaveBeenCalledTimes(1)
    expect(restaurar).toHaveBeenCalledWith({ email: 'ana@vieja.test' })
  })

  it('a person without account: the RPC only, auth never touched', async () => {
    setupCuenta({ antes: { ...ANTES, tiene_cuenta: false } })
    expect((await patch({ email: 'ana@nueva.test' })).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', { p_persona_id: ID, p_datos: { email: 'ana@nueva.test' } })
    expect(createAdmin).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('the same email in another case is not a change: auth never touched', async () => {
    setupCuenta()
    expect((await patch({ email: 'ANA@Vieja.test' })).status).toBe(200)
    expect(createAdmin).not.toHaveBeenCalled()
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('a PATCH without email does not read the previous ficha nor touch auth', async () => {
    setupCuenta()
    expect((await patch({ telefono: '0414-1234567' })).status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dream_team_editar_ficha', { p_persona_id: ID, p_datos: { telefono: '0414-1234567' } })
    expect(createAdmin).not.toHaveBeenCalled()
  })

  it('the RPC refuses an email another person holds: 409, auth never touched', async () => {
    setupCuenta({ editar: { error: { code: '23505', message: 'email_en_uso' } } })
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(409)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  describe('the logs never carry an email', () => {
    const SECRETO = /nueva\.secreta|ana@vieja/i
    const espias = () => (['error', 'warn', 'log'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}))
    const registrado = (s: jest.SpyInstance[]) => s.flatMap((x) => x.mock.calls.flat()).map((a) => inspect(a, { depth: 5 })).join('\n')

    afterEach(() => jest.restoreAllMocks())

    it.each([
      ['a service error', { auth: { error: { message: 'Service unavailable for nueva.secreta@ejemplo.test', status: 503 } } }, 502],
      ['the restore fails too', { auth: { error: { message: 'boom nueva.secreta@ejemplo.test' } }, restaurado: { data: null, error: { message: 'ana@vieja.test' } } }, 500],
      ['email_exists', { auth: { error: { code: 'email_exists', message: 'nueva.secreta@ejemplo.test already registered', status: 422 } } }, 409],
      ['a thrown error', { authLanza: true }, 502],
    ])('auth fails with %s', async (_caso, opts, status) => {
      setupCuenta(opts)
      const s = espias()
      const res = await patch({ email: 'Nueva.Secreta@ejemplo.test' })
      expect(res.status).toBe(status)
      expect(getUserById).toHaveBeenCalledWith(AUTH_ID)
      expect(registrado(s)).not.toMatch(SECRETO)
    })
  })

  it('auth threw but already holds the new email: 200, nothing restored', async () => {
    setupCuenta({ authLanza: true, releer: { data: { user: { id: AUTH_ID, email: 'ana@nueva.test' } }, error: null } })
    expect((await patch({ email: 'ana@nueva.test' })).status).toBe(200)
    expect(restaurar).not.toHaveBeenCalled()
  })

  it('auth cannot be re-read: 502 without claiming a restore', async () => {
    setupCuenta({ authLanza: true, releer: { data: { user: null }, error: { message: 'down' } } })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await patch({ email: 'ana@nueva.test' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('No se pudo confirmar el cambio del correo de inicio de sesión. Revisa la ficha y vuelve a intentarlo.')
    expect(restaurar).not.toHaveBeenCalled()
  })
})
