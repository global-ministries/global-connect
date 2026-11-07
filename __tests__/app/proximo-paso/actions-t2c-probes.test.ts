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

describe('T2c probes from the independent verification', () => {
  const recien = { ...usuarioConfirmado, user_metadata: { telefono: '04125551234' } }
  const base = (extra: Record<string, unknown> = {}) => ({ email: 'ana@example.com', token: '123456', edicionId: 'ed-dic', ...extra })
  const nada = () => {
    expect(vincularFichaConfirmada).not.toHaveBeenCalled()
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  }

  it.each([[123456], ['１２３４５６'], ['123 456'], ['12345a'], ['0123456'], [null], [{}]])(
    'S3: rejects token %j before Supabase', async (token) => {
      const r = await confirmarCodigoProximoPaso(base({ token }))
      expect(r).toMatchObject({ ok: false, error: 'invalid-input', message: 'Escribe los 6 dígitos del código.' })
      expect(verifyOtp).not.toHaveBeenCalled(); nada()
    })

  it.each([[null], ['x'], [42], [[]]])('S3: tolerates non-object input %j', async (input) => {
    const r = await confirmarCodigoProximoPaso(input)
    expect(r.ok).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled(); nada()
  })

  it('S3: empty edición never calls verifyOtp', async () => {
    const r = await confirmarCodigoProximoPaso(base({ edicionId: '  ' }))
    expect(r).toMatchObject({ ok: false, error: 'EDICION_NO_DISPONIBLE' })
    expect(verifyOtp).not.toHaveBeenCalled(); nada()
  })

  it('S3: user without session after verifyOtp links nothing', async () => {
    verifyOtp.mockResolvedValue({ data: { user: recien, session: null }, error: null })
    expect(await confirmarCodigoProximoPaso(base())).toMatchObject({ ok: false, error: 'CODIGO_INVALIDO' })
    nada()
  })

  it.each([[{ status: 500, message: 'x' }], [{ status: 0, name: 'AuthRetryableFetchError' }]])(
    'S3: 5xx/network %j says try again (not a bad code), links nothing, no sesionAbierta', async (error) => {
      verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error })
      const r = await confirmarCodigoProximoPaso(base())
      expect(r).toEqual({ ok: false, error: 'internal', message: 'No pudimos revisar tu código en este momento. Espera unos segundos y vuelve a intentarlo.' })
      nada()
    })

  it('S3: vinculo error keeps session, never enrolls', async () => {
    verifyOtp.mockResolvedValue({ data: { user: recien, session: {} }, error: null })
    vincularFichaConfirmada.mockResolvedValue({ estado: 'error' })
    const r = await confirmarCodigoProximoPaso(base())
    expect(r).toMatchObject({ ok: false, error: 'CUENTA_SIN_INSCRIPCION', sesionAbierta: true })
    expect(adminUpdate).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('S3: talleres_inscribirme failure keeps session and does not leak', async () => {
    verifyOtp.mockResolvedValue({ data: { user: recien, session: {} }, error: null })
    rpc.mockImplementation(async (n: string) =>
      n === 'proximo_paso_ediciones_abiertas' ? { data: [EDICION], error: null } : { data: null, error: { code: 'P0001', message: 'secret internal detail' } })
    const r = await confirmarCodigoProximoPaso(base())
    expect(r).toMatchObject({ ok: false, error: 'CUENTA_SIN_INSCRIPCION', sesionAbierta: true })
    expect(JSON.stringify(r)).not.toContain('secret internal detail')
  })

  it('S3/L6.1: resend identical for every non-limit answer, one call only', async () => {
    const respuestas = [
      { data: {}, error: null },
      { data: null, error: { code: 'email_exists', status: 422 } },
      { data: null, error: { status: 500, message: 'boom' } },
    ]
    const out = []
    for (const resp of respuestas) {
      resend.mockReset(); resend.mockResolvedValue(resp)
      out.push(await reenviarCodigoProximoPaso({ email: 'a@b.co', edicionId: 'ed-dic' }))
      expect(resend).toHaveBeenCalledTimes(1)
      expect(getUser).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    }
    expect(new Set(out.map((o) => JSON.stringify(o))).size).toBe(1)
  })

  it('S3: resend with no edición still builds a /proximo-paso link', async () => {
    resend.mockResolvedValue({ data: {}, error: null })
    await reenviarCodigoProximoPaso({ email: 'a@b.co' })
    expect(resend).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://global.test/auth/callback?next=%2Fproximo-paso' } }))
  })

  it('S3/L6.1: signUp existing (error) vs existing (no identities) vs new give identical results', async () => {
    const casos = [
      { data: { user: null, session: null }, error: { code: 'user_already_exists', status: 422 } },
      { data: { user: { id: 'f', identities: [] }, session: null }, error: null },
      { data: { user: { id: 'n', identities: [{}] }, session: null }, error: null },
    ]
    const out = []
    for (const c of casos) {
      jest.clearAllMocks(); getUser.mockResolvedValue({ data: { user: null } }); rpcCon([EDICION])
      signUp.mockResolvedValue(c)
      out.push(await registrarseEnProximoPaso(datos()))
      expect(vincularFichaConfirmada).not.toHaveBeenCalled()
      expect(adminUpdate).not.toHaveBeenCalled()
      expect(rpc).toHaveBeenCalledTimes(1)
    }
    expect(new Set(out.map((o) => JSON.stringify(o))).size).toBe(1)
  })
})
