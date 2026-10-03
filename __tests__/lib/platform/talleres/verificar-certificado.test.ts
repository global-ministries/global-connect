/**
 * @jest-environment node
 *
 * Shared public certificate lookup used by both the verification page and
 * GET /api/public/verificar-certificado/[codigo]. It must run as `anon`
 * with no session and go through the RPC verificar_certificado_publico,
 * which returns only the non-revoked certificate with that exact code; anon
 * has no privilege on taller_certificados itself.
 */

import { verifyPublicCertificate } from '@/lib/platform/talleres/verificar-certificado'

const createClientMock = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

const VALID_CODE = 'abcdefghijkmnpqr'
const ROW = {
  id: 'cert-1',
  codigo_verificacion: VALID_CODE,
  taller_id: 'taller-1',
  persona_id: 'persona-1',
  nombre_taller_snapshot: 'Finanzas con Propósito',
  nombre_participante_snapshot: 'Ana Pérez',
  nombre_pareja_snapshot: null,
  fecha_completitud: '2026-05-01',
  firmantes_snapshot: ['Pastor Juan', 42, 'Pastora María'],
}

type RpcResult = { data: Record<string, unknown>[] | null; error: { message: string } | null }

function queueRpc(result: RpcResult) {
  const rpc = jest.fn().mockResolvedValue(result)
  const from = jest.fn()
  createClientMock.mockReturnValue({ rpc, from })
  return { rpc, from }
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  createClientMock.mockReset()
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('verifyPublicCertificate', () => {
  it('returns only the non-sensitive fields of a certificate the visitor can see', async () => {
    queueRpc({ data: [ROW], error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual({
      valid: true,
      taller_title: 'Finanzas con Propósito',
      participant_name: 'Ana Pérez',
      partner_name: null,
      completion_date: '2026-05-01',
      signers: ['Pastor Juan', 'Pastora María'],
    })
  })

  it('asks the RPC with the code and never queries the table', async () => {
    const query = queueRpc({ data: [ROW], error: null })

    await verifyPublicCertificate(VALID_CODE)

    expect(query.rpc).toHaveBeenCalledTimes(1)
    expect(query.rpc).toHaveBeenCalledWith('verificar_certificado_publico', { p_codigo: VALID_CODE })
    expect(query.from).not.toHaveBeenCalled()
  })

  // T2b/T2c (odd/tasks/talleres-cierre-de-edicion.md) — each person of a
  // couple gets their own certificate naming the partner; the RPC returns
  // nombre_pareja_snapshot.
  it("returns the partner's name on a couple's certificate", async () => {
    queueRpc({ data: [{ ...ROW, nombre_pareja_snapshot: 'Luis Gómez' }], error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual({
      valid: true,
      taller_title: 'Finanzas con Propósito',
      participant_name: 'Ana Pérez',
      partner_name: 'Luis Gómez',
      completion_date: '2026-05-01',
      signers: ['Pastor Juan', 'Pastora María'],
    })
  })

  it('treats a non-array signers snapshot as no signers', async () => {
    queueRpc({ data: [{ ...ROW, firmantes_snapshot: null }], error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual(expect.objectContaining({ valid: true, signers: [] }))
  })

  it('queries as anon with no session and never with the service role key', async () => {
    queueRpc({ data: [ROW], error: null })

    await verifyPublicCertificate(VALID_CODE)

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(createClientMock).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }),
      })
    )
    expect(JSON.stringify(createClientMock.mock.calls)).not.toContain('service-role-key')
  })

  it.each(['', 'ABCDEFGHIJKMNPQR', 'abcdefghijkmnpq', 'abcdefghijkmnpqr2', 'abcdefghijklmnop', "abcdefghijkmnpq'"])(
    'reports the malformed code %p as not found without querying',
    async (code) => {
      const result = await verifyPublicCertificate(code)

      expect(result).toEqual({ valid: false, reason: 'not-found' })
      expect(createClientMock).not.toHaveBeenCalled()
    }
  )

  it.each([[[]], [null]])('reports a revoked or unknown certificate (RPC data %p) as not found', async (data) => {
    queueRpc({ data, error: null })

    await expect(verifyPublicCertificate(VALID_CODE)).resolves.toEqual({ valid: false, reason: 'not-found' })
  })

  it('reports a query error as not found without leaking the cause', async () => {
    queueRpc({ data: null, error: { message: 'permission denied for function verificar_certificado_publico' } })

    await expect(verifyPublicCertificate(VALID_CODE)).resolves.toEqual({ valid: false, reason: 'not-found' })
  })
})
