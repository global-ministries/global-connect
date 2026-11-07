/**
 * @jest-environment node
 *
 * Próximo Paso QR registration (odd/tasks/proximo-paso.md T2, S3) —
 * app/proximo-paso/actions.ts. The edición is always checked against
 * proximo_paso_ediciones_abiertas (never trusted from the client), a new
 * account goes through supabase.auth.signUp, the ficha is linked with the
 * same vincularFichaConfirmada as /signup, and the enrollment is the real
 * talleres_inscribirme. A signed-in visitor enrolls through the existing
 * inscribirseATaller.
 */

import { inscribirmeEnProximoPaso, registrarseEnProximoPaso } from '@/app/proximo-paso/actions'

const signUp = jest.fn()
const getUser = jest.fn()
const rpc = jest.fn()
const adminUpdate = jest.fn()
const vincularFichaConfirmada = jest.fn()
const inscribirseATaller = jest.fn()
const isTalleresEnabled = jest.fn()
const revalidatePath = jest.fn()

jest.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => isTalleresEnabled() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signUp: (...a: unknown[]) => signUp(...a), getUser: () => getUser() },
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: (tabla: string) => ({
      update: (valores: unknown) => ({
        eq: (col: string, val: unknown) => ({
          is: (col2: string, val2: unknown) => adminUpdate(tabla, valores, col, val, col2, val2),
        }),
      }),
    }),
  }),
}))
jest.mock('@/lib/supabase/vincular-ficha', () => ({
  vincularFichaConfirmada: (...a: unknown[]) => vincularFichaConfirmada(...a),
}))
jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: (...a: unknown[]) => inscribirseATaller(...a),
}))

const EDICION = {
  edicion_id: 'ed-dic',
  nombre: 'Diciembre 2026',
  fecha_inicio: '2026-12-06',
  fecha_fin: '2026-12-27',
  cupo_restante: null,
  clases: [],
}
const RESUMEN = { id: 'ed-dic', nombre: 'Diciembre 2026', fechaInicio: '2026-12-06' }

const datos = (extra: Record<string, unknown> = {}) => ({
  edicionId: 'ed-dic',
  nombre: 'Ana',
  apellido: 'Pérez',
  telefono: '0412 555 1234',
  email: 'Ana@Example.com',
  password: 'secreto123',
  ...extra,
})

const usuarioConfirmado = { id: 'auth-1', email: 'ana@example.com', email_confirmed_at: '2026-11-07T00:00:00Z', identities: [{}] }

function rpcCon(ediciones: unknown[], inscribirme: unknown = { ok: true, inscripcion_id: 'ins-1', estado: 'pendiente' }) {
  rpc.mockImplementation(async (nombre: string) => {
    if (nombre === 'proximo_paso_ediciones_abiertas') return { data: ediciones, error: null }
    if (nombre === 'talleres_inscribirme') return { data: inscribirme, error: null }
    throw new Error(`unexpected rpc ${nombre}`)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  isTalleresEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: null }, error: null })
  rpcCon([EDICION])
  adminUpdate.mockResolvedValue({ error: null })
  vincularFichaConfirmada.mockResolvedValue({ estado: 'creada' })
  process.env.NEXT_PUBLIC_SITE_URL = 'https://global.test'
})

describe('registrarseEnProximoPaso', () => {
  it('rejects invalid fields without calling Supabase', async () => {
    const r = await registrarseEnProximoPaso(datos({ email: 'no-es-correo', password: 'corta' }))
    expect(r).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Revisa los datos marcados.',
      errores: {
        email: 'Revisa tu correo: no parece una dirección válida.',
        password: 'La contraseña debe tener al menos 8 caracteres.',
      },
    })
    expect(signUp).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers not-found while talleres are off', async () => {
    isTalleresEnabled.mockReturnValue(false)
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({ ok: false, error: 'not-found', message: 'Las inscripciones no están disponibles en este momento.' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('never creates an account for an edición that is not an open Próximo Paso one', async () => {
    const r = await registrarseEnProximoPaso(datos({ edicionId: 'otro-taller' }))
    expect(r).toEqual({ ok: false, error: 'EDICION_NO_DISPONIBLE', message: 'Esa fecha ya no está disponible. Elige otra.' })
    expect(rpc).toHaveBeenCalledWith('proximo_paso_ediciones_abiertas')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('refuses a full edición before creating the account', async () => {
    rpcCon([{ ...EDICION, cupo_restante: 0 }])
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({ ok: false, error: 'CUPO_LLENO', message: 'Esta edición ya no tiene cupos disponibles.' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('does not sign up again a visitor who already has a session', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'auth-9' } }, error: null })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({
      ok: false,
      error: 'CON_SESION',
      message: 'Ya tienes sesión iniciada. Recarga la página para inscribirte con tu cuenta.',
    })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('creates the account with the confirmation link back to the chosen edición', async () => {
    signUp.mockResolvedValue({ data: { user: { ...usuarioConfirmado, email_confirmed_at: null }, session: null }, error: null })
    const r = await registrarseEnProximoPaso(datos())
    expect(signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreto123',
      options: {
        data: { nombre: 'Ana', apellido: 'Pérez', telefono: '04125551234' },
        emailRedirectTo: `https://global.test/auth/callback?next=${encodeURIComponent('/proximo-paso?edicion=ed-dic')}`,
      },
    })
    expect(r).toEqual({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN })
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('talleres_inscribirme', expect.anything())
  })

  it('links the ficha, saves the phone and enrolls when the account is confirmed at once', async () => {
    signUp.mockResolvedValue({ data: { user: usuarioConfirmado, session: { access_token: 't' } }, error: null })
    const r = await registrarseEnProximoPaso(datos())
    expect(vincularFichaConfirmada).toHaveBeenCalledWith(expect.anything(), usuarioConfirmado)
    expect(adminUpdate).toHaveBeenCalledWith('usuarios', { telefono: '04125551234' }, 'auth_id', 'auth-1', 'telefono', null)
    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', { p_edicion_id: 'ed-dic', p_pareja: null })
    expect(revalidatePath).toHaveBeenCalledWith('/talleres/mi-recorrido')
    expect(r).toEqual({ ok: true, estado: 'inscrito', edicion: RESUMEN })
  })

  it.each([
    [{ code: 'user_already_exists', status: 422, message: 'User already registered' }],
    [{ code: 'email_exists', status: 422, message: 'Email exists' }],
    [{ status: 400, message: 'User already registered' }],
  ])('sends an existing email to sign in and continue (%j)', async (error) => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({
      ok: false,
      error: 'CUENTA_EXISTENTE',
      message: 'Ya tienes una cuenta con ese correo. Inicia sesión y te inscribimos en Diciembre 2026.',
      loginHref: `/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-dic')}`,
    })
  })

  it('reads the obfuscated user of an existing email (no identities) as an existing account', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'x', email_confirmed_at: null, identities: [] }, session: null }, error: null })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toMatchObject({ ok: false, error: 'CUENTA_EXISTENTE' })
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
  })

  it('maps a weak password and the rate limit to plain messages', async () => {
    signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: 'weak_password', status: 422 } })
    expect(await registrarseEnProximoPaso(datos())).toEqual({
      ok: false,
      error: 'invalid-input',
      message: 'Revisa los datos marcados.',
      errores: { password: 'Elige una contraseña más segura: mezcla letras y números.' },
    })
    signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: 'over_email_send_rate_limit', status: 429 } })
    expect(await registrarseEnProximoPaso(datos())).toEqual({
      ok: false,
      error: 'LIMITE',
      message: 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
    })
    signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: { status: 500, message: 'boom' } })
    expect(await registrarseEnProximoPaso(datos())).toEqual({
      ok: false,
      error: 'internal',
      message: 'No se pudo completar el registro. Inténtalo de nuevo.',
    })
  })

  it('keeps the account but does not enroll while a director must review the ficha', async () => {
    signUp.mockResolvedValue({ data: { user: usuarioConfirmado, session: { access_token: 't' } }, error: null })
    vincularFichaConfirmada.mockResolvedValue({ estado: 'pendiente_aprobacion' })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({
      ok: false,
      error: 'CUENTA_EN_REVISION',
      message: 'Tu cuenta quedó creada. La coordinación debe revisarla antes de inscribirte; te avisaremos.',
    })
    expect(rpc).not.toHaveBeenCalledWith('talleres_inscribirme', expect.anything())
  })

  it('says the account exists when the enrollment itself fails', async () => {
    signUp.mockResolvedValue({ data: { user: usuarioConfirmado, session: { access_token: 't' } }, error: null })
    rpcCon([EDICION], { ok: false, codigo: 'CUPO_LLENO' })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({
      ok: false,
      error: 'CUENTA_SIN_INSCRIPCION',
      message: 'Tu cuenta quedó creada, pero no pudimos inscribirte: Esta edición ya no tiene cupos disponibles.',
    })
  })

  it('answers internal when the list of ediciones cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toEqual({ ok: false, error: 'internal', message: 'No se pudo completar el registro. Inténtalo de nuevo.' })
    expect(signUp).not.toHaveBeenCalled()
  })
})

describe('inscribirmeEnProximoPaso (signed in)', () => {
  const sesion = { id: 'auth-2', user_metadata: { telefono: '04145550000' } }

  it('enrolls through the existing inscribirseATaller after checking the edición', async () => {
    getUser.mockResolvedValue({ data: { user: sesion }, error: null })
    inscribirseATaller.mockResolvedValue({ ok: true, inscripcionId: 'ins-2' })
    const r = await inscribirmeEnProximoPaso('ed-dic')
    expect(inscribirseATaller).toHaveBeenCalledWith({ edicionId: 'ed-dic' })
    expect(adminUpdate).toHaveBeenCalledWith('usuarios', { telefono: '04145550000' }, 'auth_id', 'auth-2', 'telefono', null)
    expect(r).toEqual({ ok: true, estado: 'inscrito', edicion: RESUMEN })
  })

  it('never enrolls in an edición outside the open Próximo Paso list', async () => {
    getUser.mockResolvedValue({ data: { user: sesion }, error: null })
    const r = await inscribirmeEnProximoPaso('otro-taller')
    expect(r).toEqual({ ok: false, error: 'EDICION_NO_DISPONIBLE', message: 'Esa fecha ya no está disponible. Elige otra.' })
    expect(inscribirseATaller).not.toHaveBeenCalled()
  })

  it('passes the enrollment failure through', async () => {
    getUser.mockResolvedValue({ data: { user: sesion }, error: null })
    inscribirseATaller.mockResolvedValue({ ok: false, error: 'YA_INSCRITO', message: 'Ya tienes una inscripción en esta edición.' })
    const r = await inscribirmeEnProximoPaso('ed-dic')
    expect(r).toEqual({ ok: false, error: 'YA_INSCRITO', message: 'Ya tienes una inscripción en esta edición.' })
    expect(adminUpdate).not.toHaveBeenCalled()
  })

  it('asks a visitor without a session to sign in', async () => {
    const r = await inscribirmeEnProximoPaso('ed-dic')
    expect(r).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'Inicia sesión para inscribirte.',
      loginHref: `/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-dic')}`,
    })
    expect(inscribirseATaller).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 42])('rejects %j as edición', async (valor) => {
    const r = await inscribirmeEnProximoPaso(valor)
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Elige una fecha para empezar.' })
  })
})
