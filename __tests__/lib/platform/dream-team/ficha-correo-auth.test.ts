/**
 * @jest-environment node
 *
 * Dream Team — the login email follows the ficha (odd/tasks/dream-team-pendientes-director.md,
 * S3 and S8): the order of the reads and writes, and what happens when auth fails.
 */
import {
  adminCorreoDesdeCliente,
  editarFichaConCorreo,
  MENSAJE_LOGIN_NO_CAMBIADO,
  MENSAJE_LOGIN_NO_CONFIRMADO,
  type AdminCorreo,
} from '@/lib/platform/dream-team/ficha-correo-auth'
import { parseEditarFicha } from '@/lib/platform/dream-team/ficha-persona'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AUTH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ANTES = { id: ID, nombre: 'Ana', apellido: 'Pérez', email: 'ana@vieja.test', tiene_cuenta: true, puede_editar_email: true }
const NUEVO = 'ana@nueva.test'

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }

/** Records every read and write in order; each step answers what the case says. */
function deps(opts: {
  previa?: Respuesta
  editar?: Respuesta
  adminLanza?: boolean
  authId?: string | null
  auth?: () => Promise<{ error: { code?: string; message?: string; status?: number } | null }>
  releer?: () => Promise<string | null>
} = {}) {
  const orden: string[] = []
  const rpcUsuario = jest.fn((nombre: string, args: Record<string, unknown>) => {
    orden.push(nombre)
    if (nombre === 'dream_team_ficha_persona') return Promise.resolve(opts.previa ?? { data: ANTES, error: null })
    return Promise.resolve(opts.editar ?? { data: { ...ANTES, ...(args.p_datos as object) }, error: null })
  })
  const correo = {
    leerAuthId: jest.fn(async () => { orden.push('leer'); return opts.authId === undefined ? AUTH_ID : opts.authId }),
    actualizarEmailAuth: jest.fn(async () => { orden.push('auth'); return opts.auth ? opts.auth() : { error: null } }),
    leerEmailAuth: jest.fn(async () => { orden.push('releer'); return opts.releer ? opts.releer() : ANTES.email }),
    restaurarEmail: jest.fn(async () => { orden.push('restaurar'); return true }),
  } satisfies AdminCorreo
  const admin = jest.fn(() => {
    orden.push('admin()')
    if (opts.adminLanza) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')
    return correo
  })
  return { orden, correo, admin, rpcUsuario, d: { rpcUsuario, admin } }
}

describe('editarFichaConCorreo', () => {
  it('flags missing in the previous ficha: ok, the admin client is never built', async () => {
    const t = deps({ previa: { data: { id: ID, email: 'ana@vieja.test' }, error: null } })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: true })
    expect(t.admin).not.toHaveBeenCalled()
    expect(t.orden).toEqual(['dream_team_ficha_persona', 'dream_team_editar_ficha'])
  })

  it('the previous ficha is refused (42501): 403 and only the read ran', async () => {
    const t = deps({ previa: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: false, status: 403 })
    expect(t.orden).toEqual(['dream_team_ficha_persona'])
  })

  it('the admin client cannot be built: it throws and the RPC never runs', async () => {
    const t = deps({ adminLanza: true })
    await expect(editarFichaConCorreo(t.d, ID, { email: NUEVO })).rejects.toThrow()
    expect(t.orden).toEqual(['dream_team_ficha_persona', 'admin()'])
  })

  it('a blank email for an account holder: the RPC refuses (email_invalido) → 422, admin never built', async () => {
    const t = deps({ editar: { data: null, error: { code: '22023', message: 'email_invalido' } } })
    expect(await editarFichaConCorreo(t.d, ID, { email: null })).toEqual({ ok: false, status: 422, error: 'Escribe un correo válido', causa: undefined })
    expect(t.admin).not.toHaveBeenCalled()
  })

  it('the RPC refuses (email_solo_admin) after the read said yes: 403, auth untouched', async () => {
    const t = deps({ editar: { data: null, error: { code: '42501', message: 'email_solo_admin' } } })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: false, status: 403 })
    expect(t.orden).toEqual(['dream_team_ficha_persona', 'admin()', 'dream_team_editar_ficha'])
    expect(t.correo.actualizarEmailAuth).not.toHaveBeenCalled()
  })

  it('happy path: read → admin() → RPC → auth_id → auth', async () => {
    const t = deps()
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: true })
    expect(t.orden).toEqual(['dream_team_ficha_persona', 'admin()', 'dream_team_editar_ficha', 'leer', 'auth'])
    expect(t.correo.actualizarEmailAuth).toHaveBeenCalledWith(AUTH_ID, NUEVO)
  })

  it('auth throws but the re-read shows the new email: ok, no restore', async () => {
    const t = deps({ auth: () => Promise.reject(new Error('socket hang up')), releer: async () => 'Ana@Nueva.TEST' })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: true })
    expect(t.correo.leerEmailAuth).toHaveBeenCalledWith(AUTH_ID)
    expect(t.correo.restaurarEmail).not.toHaveBeenCalled()
    expect(t.orden).toEqual(['dream_team_ficha_persona', 'admin()', 'dream_team_editar_ficha', 'leer', 'auth', 'releer'])
  })

  it('auth throws and the re-read shows the old email: restore and 502', async () => {
    const t = deps({ auth: () => Promise.reject(new Error('socket hang up')) })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: false, status: 502, error: MENSAJE_LOGIN_NO_CAMBIADO })
    expect(t.correo.restaurarEmail).toHaveBeenCalledWith(ID, NUEVO, 'ana@vieja.test')
    expect(t.orden.slice(-3)).toEqual(['auth', 'releer', 'restaurar'])
  })

  it('auth throws and the re-read fails: 502 without claiming a restore, no restore', async () => {
    const t = deps({ auth: () => Promise.reject(new Error('socket hang up')), releer: () => Promise.reject(new Error('down')) })
    const r = await editarFichaConCorreo(t.d, ID, { email: NUEVO })
    expect(r).toMatchObject({ ok: false, status: 502, error: MENSAJE_LOGIN_NO_CONFIRMADO })
    expect(MENSAJE_LOGIN_NO_CONFIRMADO).toBe('No se pudo confirmar el cambio del correo de inicio de sesión. Revisa la ficha y vuelve a intentarlo.')
    expect(t.correo.restaurarEmail).not.toHaveBeenCalled()
  })

  it('the failure cause carries codes only, never an email', async () => {
    const t = deps({ auth: () => Promise.reject(new Error(`cannot set ${NUEVO}`)), releer: () => Promise.reject(new Error(`ana@vieja.test`)) })
    const r = await editarFichaConCorreo(t.d, ID, { email: NUEVO })
    expect(JSON.stringify(r)).not.toMatch(/@/)
  })

  it('no account at read time (no auth_id): no sync', async () => {
    const t = deps({ authId: null })
    expect(await editarFichaConCorreo(t.d, ID, { email: NUEVO })).toMatchObject({ ok: true })
    expect(t.correo.actualizarEmailAuth).not.toHaveBeenCalled()
    expect(t.correo.restaurarEmail).not.toHaveBeenCalled()
  })
})

describe('adminCorreoDesdeCliente', () => {
  function cliente(respuesta: { data: unknown; error: unknown }) {
    const filtros: Array<[string, unknown]> = []
    const update = jest.fn()
    const cadena = {
      eq: (columna: string, valor: unknown) => { filtros.push([columna, valor]); return cadena },
      select: () => Promise.resolve(respuesta),
    }
    const from = jest.fn(() => ({ update: (v: unknown) => { update(v); return cadena } }))
    return { filtros, update, cliente: { from } as unknown as Parameters<typeof adminCorreoDesdeCliente>[0] }
  }

  it('restaurarEmail only while usuarios.email still holds the new one; true for exactly one row', async () => {
    const c = cliente({ data: [{ id: ID }], error: null })
    expect(await adminCorreoDesdeCliente(c.cliente).restaurarEmail(ID, NUEVO, 'ana@vieja.test')).toBe(true)
    expect(c.update).toHaveBeenCalledWith({ email: 'ana@vieja.test' })
    expect(c.filtros).toEqual([['id', ID], ['email', NUEVO]])
  })

  it.each([
    ['no row', { data: [], error: null }],
    ['two rows', { data: [{ id: ID }, { id: 'x' }], error: null }],
    ['an error', { data: null, error: { message: 'down' } }],
  ])('restaurarEmail is false for %s', async (_caso, respuesta) => {
    expect(await adminCorreoDesdeCliente(cliente(respuesta).cliente).restaurarEmail(ID, NUEVO, 'ana@vieja.test')).toBe(false)
  })

  it('leerEmailAuth reads auth.users through getUserById and throws on an error', async () => {
    const getUserById = jest.fn()
      .mockResolvedValueOnce({ data: { user: { id: AUTH_ID, email: NUEVO } }, error: null })
      .mockResolvedValueOnce({ data: { user: null }, error: { message: 'down' } })
    const a = adminCorreoDesdeCliente({ auth: { admin: { getUserById } } } as unknown as Parameters<typeof adminCorreoDesdeCliente>[0])
    expect(await a.leerEmailAuth(AUTH_ID)).toBe(NUEVO)
    expect(getUserById).toHaveBeenCalledWith(AUTH_ID)
    await expect(a.leerEmailAuth(AUTH_ID)).rejects.toThrow()
  })
})

describe('parseEditarFicha and the email (S3)', () => {
  it.each(['tieneCuenta', 'puede_editar_email'])('refuses {email, %s}', (clave) => {
    expect(parseEditarFicha({ email: NUEVO, [clave]: true })).toEqual({ error: `Campo no editable: ${clave}` })
  })

  it('trims and lowercases the email', () => {
    expect(parseEditarFicha({ email: '  Ana@Nueva.TEST ' })).toEqual({ datos: { email: 'ana@nueva.test' } })
  })
})
