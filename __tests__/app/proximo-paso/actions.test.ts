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

import {
  confirmarCodigoProximoPaso,
  inscribirmeEnProximoPaso,
  reenviarCodigoProximoPaso,
  registrarseEnProximoPaso,
} from '@/app/proximo-paso/actions'

const signUp = jest.fn()
const verifyOtp = jest.fn()
const resend = jest.fn()
const getUser = jest.fn()
const rpc = jest.fn()
const adminUpdate = jest.fn()
const vincularFichaConfirmada = jest.fn()
const inscribirseATaller = jest.fn()
const isTalleresEnabled = jest.fn()
const revalidatePath = jest.fn()
const leerInscripcion = jest.fn()

jest.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => isTalleresEnabled() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signUp: (...a: unknown[]) => signUp(...a),
      getUser: () => getUser(),
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      resend: (...a: unknown[]) => resend(...a),
    },
    rpc: (...a: unknown[]) => rpc(...a),
    from: (tabla: string) => ({
      select: (columnas: string) => ({
        eq: (col: string, val: unknown) => ({ maybeSingle: () => leerInscripcion(tabla, columnas, col, val) }),
      }),
    }),
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

function rpcCon(ediciones: unknown[], inscribirme: unknown = { ok: true, inscripcion_id: 'ins-1', estado: 'aprobado' }) {
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
  leerInscripcion.mockResolvedValue({ data: { estado: 'aprobado' }, error: null })
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

  // L6.1: never reveal whether an email already has an account. Supabase
  // answers an existing email with an error (confirmation off) or with a user
  // without identities (confirmation on); both read exactly like a new
  // account that must confirm its email, with no extra call.
  it.each([
    ['user_already_exists', { data: { user: null, session: null }, error: { code: 'user_already_exists', status: 422, message: 'User already registered' } }],
    ['email_exists', { data: { user: null, session: null }, error: { code: 'email_exists', status: 422, message: 'Email exists' } }],
    ['a bare 400', { data: { user: null, session: null }, error: { status: 400, message: 'User already registered' } }],
    ['the obfuscated user without identities', { data: { user: { id: 'x', email_confirmed_at: null, identities: [] }, session: null }, error: null }],
  ])('answers an existing email (%s) exactly like a new account', async (_caso, respuesta) => {
    signUp.mockResolvedValue({ data: { user: { ...usuarioConfirmado, email_confirmed_at: null }, session: null }, error: null })
    const nueva = await registrarseEnProximoPaso(datos())
    const llamadasNueva = rpc.mock.calls.length

    jest.clearAllMocks()
    rpcCon([EDICION])
    signUp.mockResolvedValue(respuesta)
    const existente = await registrarseEnProximoPaso(datos())

    expect(existente).toEqual(nueva)
    expect(existente).toEqual({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN })
    expect(rpc.mock.calls.length).toBe(llamadasNueva)
    expect(signUp).toHaveBeenCalledTimes(1)
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(JSON.stringify(existente)).not.toMatch(/CUENTA_EXISTENTE|Ya tienes una cuenta/)
  })

  it('sends signUp the trimmed lowercase email and the callback back to the edición', async () => {
    signUp.mockResolvedValue({ data: { user: { ...usuarioConfirmado, email_confirmed_at: null }, session: null }, error: null })
    await registrarseEnProximoPaso(datos({ email: '  Ana.Perez@Example.COM  ' }))
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ana.perez@example.com',
        options: expect.objectContaining({
          emailRedirectTo: 'https://global.test/auth/callback?next=%2Fproximo-paso%3Fedicion%3Ded-dic',
        }),
      }),
    )
  })

  it('never links, updates or enrolls an account that is not confirmed yet', async () => {
    signUp.mockResolvedValue({ data: { user: { ...usuarioConfirmado, email_confirmed_at: null }, session: { access_token: 't' } }, error: null })
    const r = await registrarseEnProximoPaso(datos())
    expect(r).toMatchObject({ ok: true, estado: 'confirmar_correo' })
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('talleres_inscribirme', expect.anything())
  })

  // L6.2: an inscripción approved on the spot (Próximo Paso with cupo) reads
  // "inscrito"; one waiting for the coordinación reads "pendiente".
  it('reports pendiente when the enrollment waits for the coordinación', async () => {
    signUp.mockResolvedValue({ data: { user: usuarioConfirmado, session: { access_token: 't' } }, error: null })
    rpcCon([EDICION], { ok: true, inscripcion_id: 'ins-1', estado: 'pendiente' })
    expect(await registrarseEnProximoPaso(datos())).toEqual({ ok: true, estado: 'pendiente', edicion: RESUMEN })
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
    expect(leerInscripcion).toHaveBeenCalledWith('taller_inscripciones', 'estado', 'id', 'ins-2')
    expect(adminUpdate).toHaveBeenCalledWith('usuarios', { telefono: '04145550000' }, 'auth_id', 'auth-2', 'telefono', null)
    expect(r).toEqual({ ok: true, estado: 'inscrito', edicion: RESUMEN })
  })

  it.each([
    ['pendiente', { data: { estado: 'pendiente' }, error: null }],
    ['unreadable', { data: null, error: { message: 'down' } }],
  ])('reports pendiente when the inscripción is %s', async (_caso, lectura) => {
    getUser.mockResolvedValue({ data: { user: sesion }, error: null })
    inscribirseATaller.mockResolvedValue({ ok: true, inscripcionId: 'ins-2' })
    leerInscripcion.mockResolvedValue(lectura)
    expect(await inscribirmeEnProximoPaso('ed-dic')).toEqual({ ok: true, estado: 'pendiente', edicion: RESUMEN })
  })

  it('refuses a full edición before enrolling', async () => {
    getUser.mockResolvedValue({ data: { user: sesion }, error: null })
    rpcCon([{ ...EDICION, cupo_restante: 0 }])
    const r = await inscribirmeEnProximoPaso('ed-dic')
    expect(r).toEqual({ ok: false, error: 'CUPO_LLENO', message: 'Esta edición ya no tiene cupos disponibles.' })
    expect(inscribirseATaller).not.toHaveBeenCalled()
  })

  it.each(['//evil.example/x', 'https://evil.example', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)'])(
    'keeps the login redirect on this site for the hostile id %j',
    async (hostil) => {
      const r = await inscribirmeEnProximoPaso(hostil)
      expect(r).toMatchObject({ ok: false, error: 'unauthorized' })
      const loginHref = (r as { loginHref: string }).loginHref
      const login = new URL(loginHref, 'https://global.test')
      expect(login.origin).toBe('https://global.test')
      expect(login.pathname).toBe('/')
      const redirect = login.searchParams.get('redirect') ?? ''
      expect(redirect.startsWith('/proximo-paso?edicion=')).toBe(true)
      expect(new URL(redirect, 'https://global.test').origin).toBe('https://global.test')
      expect(new URL(redirect, 'https://global.test').searchParams.get('edicion')).toBe(hostil.trim())
    },
  )

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

// T2c (L8): the 6-digit code of the confirmation email, typed on the same page.
describe('confirmarCodigoProximoPaso', () => {
  const recienConfirmado = {
    ...usuarioConfirmado,
    user_metadata: { nombre: 'Ana', apellido: 'Pérez', telefono: '04125551234' },
  }
  const codigo = (extra: Record<string, unknown> = {}) => ({ email: '  Ana@Example.COM ', token: ' 123456 ', edicionId: 'ed-dic', ...extra })
  const verificado = () => verifyOtp.mockResolvedValue({ data: { user: recienConfirmado, session: { access_token: 't' } }, error: null })

  it('verifies the code as a signup with the trimmed lowercase email', async () => {
    verificado()
    await confirmarCodigoProximoPaso(codigo())
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', type: 'signup' })
  })

  it('links the ficha, saves the phone and enrolls once the code is right', async () => {
    verificado()
    const r = await confirmarCodigoProximoPaso(codigo())
    expect(vincularFichaConfirmada).toHaveBeenCalledWith(expect.anything(), recienConfirmado)
    expect(adminUpdate).toHaveBeenCalledWith('usuarios', { telefono: '04125551234' }, 'auth_id', 'auth-1', 'telefono', null)
    expect(rpc).toHaveBeenCalledWith('talleres_inscribirme', { p_edicion_id: 'ed-dic', p_pareja: null })
    expect(revalidatePath).toHaveBeenCalledWith('/talleres/mi-recorrido')
    expect(r).toEqual({ ok: true, estado: 'inscrito', edicion: RESUMEN })
  })

  it('reports pendiente when the enrollment waits for the coordinación', async () => {
    verificado()
    rpcCon([EDICION], { ok: true, inscripcion_id: 'ins-1', estado: 'pendiente' })
    expect(await confirmarCodigoProximoPaso(codigo())).toEqual({ ok: true, estado: 'pendiente', edicion: RESUMEN })
  })

  it('re-checks the edición after the verification, before enrolling', async () => {
    verificado()
    rpcCon([])
    const r = await confirmarCodigoProximoPaso(codigo())
    expect(r).toEqual({
      ok: false,
      error: 'EDICION_NO_DISPONIBLE',
      message: 'Esa fecha ya no está disponible. Elige otra.',
      sesionAbierta: true,
    })
    const orden = (fn: jest.Mock, i = 0) => fn.mock.invocationCallOrder[i]
    expect(orden(verifyOtp)).toBeLessThan(orden(rpc))
    expect(rpc).toHaveBeenCalledWith('proximo_paso_ediciones_abiertas')
    expect(rpc).not.toHaveBeenCalledWith('talleres_inscribirme', expect.anything())
  })

  it.each([
    ['otp_expired', { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }],
    ['a bare 400', { status: 400, message: 'Invalid token' }],
    ['an unknown email', { code: 'user_not_found', status: 400 }],
  ])('answers the same generic message for a wrong code (%s) and links nothing', async (_caso, error) => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error })
    const r = await confirmarCodigoProximoPaso(codigo())
    expect(r).toEqual({
      ok: false,
      error: 'CODIGO_INVALIDO',
      message: 'El código no es válido o ya venció. Revisa el último correo o pide uno nuevo.',
    })
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['429', { status: 429, message: 'Too many requests' }],
    ['over_request_rate_limit', { code: 'over_request_rate_limit', status: 429 }],
  ])('maps the rate limit (%s) to a plain message', async (_caso, error) => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error })
    expect(await confirmarCodigoProximoPaso(codigo())).toEqual({
      ok: false,
      error: 'LIMITE',
      message: 'Hiciste muchos intentos. Espera un momento y vuelve a intentarlo.',
    })
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
  })

  it.each(['12345', '1234567', 'abcdef', '', undefined])('rejects the code %j without calling Supabase', async (token) => {
    const r = await confirmarCodigoProximoPaso(codigo({ token }))
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Escribe los 6 dígitos del código.' })
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid email without calling Supabase', async () => {
    const r = await confirmarCodigoProximoPaso(codigo({ email: 'no-es-correo' }))
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Revisa tu correo: no parece una dirección válida.' })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('answers not-found while talleres are off', async () => {
    isTalleresEnabled.mockReturnValue(false)
    expect(await confirmarCodigoProximoPaso(codigo())).toEqual({
      ok: false,
      error: 'not-found',
      message: 'Las inscripciones no están disponibles en este momento.',
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('keeps the confirmed account but does not enroll while a director must review the ficha', async () => {
    verificado()
    vincularFichaConfirmada.mockResolvedValue({ estado: 'pendiente_aprobacion' })
    const r = await confirmarCodigoProximoPaso(codigo())
    expect(r).toEqual({
      ok: false,
      error: 'CUENTA_EN_REVISION',
      message: 'Tu cuenta quedó creada. La coordinación debe revisarla antes de inscribirte; te avisaremos.',
      sesionAbierta: true,
    })
    expect(rpc).not.toHaveBeenCalledWith('talleres_inscribirme', expect.anything())
  })
})

describe('reenviarCodigoProximoPaso', () => {
  const ENVIADO = { ok: true, message: 'Te enviamos un código nuevo. Revisa tu correo, también la carpeta de spam.' }

  it('resends the signup email with the link back to the edición', async () => {
    resend.mockResolvedValue({ data: {}, error: null })
    const r = await reenviarCodigoProximoPaso({ email: ' Ana@Example.com ', edicionId: 'ed-dic' })
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ana@example.com',
      options: { emailRedirectTo: `https://global.test/auth/callback?next=${encodeURIComponent('/proximo-paso?edicion=ed-dic')}` },
    })
    expect(r).toEqual(ENVIADO)
  })

  it.each([
    ['sent', { data: {}, error: null }],
    ['an unknown email', { data: null, error: { code: 'user_not_found', status: 400 } }],
    ['an already confirmed email', { data: null, error: { code: 'email_address_invalid', status: 400 } }],
  ])('answers the same message whether or not the email exists (%s)', async (_caso, respuesta) => {
    resend.mockResolvedValue(respuesta)
    expect(await reenviarCodigoProximoPaso({ email: 'ana@example.com', edicionId: 'ed-dic' })).toEqual(ENVIADO)
    expect(resend).toHaveBeenCalledTimes(1)
  })

  it('maps the rate limit to a plain message', async () => {
    resend.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit', status: 429 } })
    expect(await reenviarCodigoProximoPaso({ email: 'ana@example.com', edicionId: 'ed-dic' })).toEqual({
      ok: false,
      error: 'LIMITE',
      message: 'Hiciste muchos intentos. Espera un momento y vuelve a intentarlo.',
    })
  })

  it('rejects an invalid email without calling Supabase', async () => {
    const r = await reenviarCodigoProximoPaso({ email: 'ana@', edicionId: 'ed-dic' })
    expect(r).toEqual({ ok: false, error: 'invalid-input', message: 'Revisa tu correo: no parece una dirección válida.' })
    expect(resend).not.toHaveBeenCalled()
  })
})
