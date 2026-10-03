/**
 * @jest-environment node
 *
 * Shared public certificate lookup used by both the verification page and
 * GET /api/public/verificar-certificado/[codigo]. It must query as `anon`
 * with no session, so RLS `taller_certificados_select_anon`
 * (revocado_at IS NULL) alone decides what a visitor can see.
 */

import { verifyPublicCertificate } from '@/lib/platform/talleres/verificar-certificado'

const createClientMock = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))

const VALID_CODE = 'abcdefghijkmnpqr'
const NON_SENSITIVE_COLUMNS =
  'id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot, nombre_pareja_snapshot, fecha_completitud, firmantes_snapshot'

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

type QueryResult = { data: Record<string, unknown> | null; error: { message: string } | null }

function queueQuery(result: QueryResult) {
  const maybeSingle = jest.fn().mockResolvedValue(result)
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  createClientMock.mockReturnValue({ from })
  return { from, select, eq, maybeSingle }
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
    const query = queueQuery({ data: ROW, error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual({
      valid: true,
      taller_title: 'Finanzas con Propósito',
      participant_name: 'Ana Pérez',
      partner_name: null,
      completion_date: '2026-05-01',
      signers: ['Pastor Juan', 'Pastora María'],
    })
    expect(query.from).toHaveBeenCalledWith('taller_certificados')
    expect(query.select).toHaveBeenCalledWith(NON_SENSITIVE_COLUMNS)
    expect(query.eq).toHaveBeenCalledWith('codigo_verificacion', VALID_CODE)
  })

  // T2b/T2c (odd/tasks/talleres-cierre-de-edicion.md) — each person of a
  // couple gets their own certificate naming the partner; the anon GRANT
  // covers nombre_pareja_snapshot.
  it("returns the partner's name on a couple's certificate", async () => {
    queueQuery({ data: { ...ROW, nombre_pareja_snapshot: 'Luis Gómez' }, error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual(expect.objectContaining({ valid: true, partner_name: 'Luis Gómez' }))
  })

  it('treats a non-array signers snapshot as no signers', async () => {
    queueQuery({ data: { ...ROW, firmantes_snapshot: null }, error: null })

    const result = await verifyPublicCertificate(VALID_CODE)

    expect(result).toEqual(expect.objectContaining({ valid: true, signers: [] }))
  })

  it('queries as anon with no session and never with the service role key', async () => {
    queueQuery({ data: ROW, error: null })

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

  it('reports a revoked or unknown certificate as not found (RLS hides revoked rows from anon)', async () => {
    queueQuery({ data: null, error: null })

    await expect(verifyPublicCertificate(VALID_CODE)).resolves.toEqual({ valid: false, reason: 'not-found' })
  })

  it('reports a query error as not found without leaking the cause', async () => {
    queueQuery({ data: null, error: { message: 'permission denied for table taller_certificados' } })

    await expect(verifyPublicCertificate(VALID_CODE)).resolves.toEqual({ valid: false, reason: 'not-found' })
  })
})
