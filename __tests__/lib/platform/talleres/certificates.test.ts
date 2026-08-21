/**
 * PR10 — DT-040 — Taller certificate tests (pure unit + I-6 additive).
 *
 * No real Supabase traffic; verifies the encode helpers, the
 * hand-rolled PDF builder, and the verification shape contract.
 *
 * The I-6 additive invariant is asserted via grep against the
 * migration file (no DROP / DELETE FROM / TRUNCATE / ALTER COLUMN TYPE).
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  ALPHABET,
  buildVerificationUrl,
  composeCertificatePdf,
  encodeBase32UrlSafe,
  generateCertificateCode,
  generateCertificateForInscription,
  isValidCertificateCode,
  buildQrSvg,
} from '@/lib/platform/talleres/certificates'

const MIGRATION = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260811130000_talleres_tables_certificados_periodos.sql',
)

describe('Talleres certificates — pure helpers', () => {
  it('ALPHABET excludes confusable glyphs (no 0/O/1/l/I)', () => {
    expect(ALPHABET).not.toMatch(/[0O1lI]/)
    expect(ALPHABET.length).toBe(32)
  })

  it('encodeBase32UrlSafe produces ALPHABET-only output of the requested length', () => {
    for (const len of [1, 2, 5, 16, 32, 64]) {
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i += 1) bytes[i] = i & 0xff
      const code = encodeBase32UrlSafe(bytes, 16)
      expect(code.length).toBe(16)
      expect(code).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]+$/)
    }
  })

  it('generateCertificateCode returns verifier-friendly 16-char codes', () => {
    for (let i = 0; i < 100; i += 1) {
      const c = generateCertificateCode()
      expect(c.length).toBe(16)
      expect(c).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{16}$/)
    }
    expect(generateCertificateCode()).not.toBe(generateCertificateCode())
  })

  it('isValidCertificateCode accepts only ALPHABET/16', () => {
    expect(isValidCertificateCode('abcdefghijkmnpqr')).toBe(true) // 16 chars all in ALPHABET
    expect(isValidCertificateCode('0123456789abcdef')).toBe(false) // contains 0
    expect(isValidCertificateCode('OOOOOOOOOOOOOOOO')).toBe(false) // O is not in ALPHABET
    expect(isValidCertificateCode('short')).toBe(false) // not 16 chars
  })

  it('buildVerificationUrl strips trailing slash and appends /verificar-certificado/{codigo}', () => {
    expect(buildVerificationUrl('https://example.com/', 'abcdefghijkmnpqrs')).toBe(
      'https://example.com/verificar-certificado/abcdefghijkmnpqrs',
    )
    expect(buildVerificationUrl('https://example.com', 'abcdefghijkmnpqrs')).toBe(
      'https://example.com/verificar-certificado/abcdefghijkmnpqrs',
    )
  })
})

describe('composeCertificatePdf (minimal hand-rolled)', () => {
  const sample = {
    title: 'Certificado',
    tallerTitle: 'Matrimonio 101',
    participantName: 'Ana García',
    completionDateLabel: '2026-08-11',
    signers: ['Pastor Líder', 'Director General'],
    verificationUrl: 'https://example.com/verificar-certificado/abcdefghijkmnpqrs',
  }

  it('starts with %PDF-1.4 magic bytes', () => {
    const out = composeCertificatePdf(sample)
    expect(out.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
  })

  it('ends with %%EOF', () => {
    const out = composeCertificatePdf(sample)
    expect(out.subarray(out.length - 8).toString('latin1')).toContain('%%EOF')
  })

  it('embeds taller title, participant name, and completion date as text', () => {
    const out = composeCertificatePdf(sample)
    expect(out.toString('latin1')).toContain('Matrimonio 101')
    expect(out.toString('latin1')).toContain('Ana Garc')
    expect(out.toString('latin1')).toContain('2026-08-11')
  })

  it('is idempotent — two calls with same inputs produce byte-equal output', () => {
    const a = composeCertificatePdf(sample)
    const b = composeCertificatePdf(sample)
    expect(a.length).toBe(b.length)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('buildQrSvg (placeholder, future PR swaps for real QR)', () => {
  it('returns a non-empty SVG containing the URL', () => {
    const svg = buildQrSvg({ text: 'https://example.com/verificar-certificado/abcdefghijkmnpqrs', size: 4 })
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('https://example.com')
    expect(svg).toContain('</svg>')
  })
})

describe('generateCertificateForInscription — RPC wrapper (PR48/PR E)', () => {
  interface RpcCall {
    readonly name: string
    readonly args: { p_inscripcion_id?: string; p_codigo_verificacion?: string }
  }

  function makeClient(
    result: { data: unknown; error: { message: string } | null },
    calls: RpcCall[],
  ): { rpc: (name: string, args: RpcCall['args']) => Promise<typeof result> } {
    return {
      rpc: (name, args) => {
        calls.push({ name, args })
        return Promise.resolve(result)
      },
    }
  }

  it('calls emit_taller_certificado with the inscription id and a fresh 16-char code', async () => {
    const calls: RpcCall[] = []
    const client = makeClient(
      { data: { ok: true, created: true, certificado_id: 'cert-1', codigo_verificacion: 'ignored' }, error: null },
      calls,
    )
    await generateCertificateForInscription(client, 'insc-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('emit_taller_certificado')
    expect(calls[0]?.args.p_inscripcion_id).toBe('insc-1')
    expect(calls[0]?.args.p_codigo_verificacion).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{16}$/)
  })

  it('normalises the RPC jsonb into { ok, created, certificadoId, codigoVerificacion }', async () => {
    const calls: RpcCall[] = []
    const client = makeClient(
      { data: { ok: true, created: true, certificado_id: 'cert-1', codigo_verificacion: 'abcdefghijkmnpqr' }, error: null },
      calls,
    )
    const res = await generateCertificateForInscription(client, 'insc-1')
    expect(res.ok).toBe(true)
    expect(res.created).toBe(true)
    expect(res.certificadoId).toBe('cert-1')
  })

  it('passes the SAME generated code it sent to the RPC through as codigoVerificacion', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: { ok: true, created: true, certificado_id: 'c' }, error: null }, calls)
    const res = await generateCertificateForInscription(client, 'insc-1')
    expect(res.codigoVerificacion).toBe(calls[0]?.args.p_codigo_verificacion)
  })

  it('is best-effort — an RPC error returns ok:false with the message, never throws', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: null, error: { message: 'permission denied' } }, calls)
    const res = await generateCertificateForInscription(client, 'insc-1')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('permission denied')
  })
})

describe('I-6 additive invariant — migration contains no destructive DDL', () => {
  it('grep for forbidden patterns returns 0 hits', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8')
    const lines = sql.split('\n')
    // Strip comments so a "-- no DROP" comment in a doc block doesn't count.
    const noComments = lines.filter((l) => !l.trim().startsWith('--')).join('\n')
    const forbiddenPatterns: Array<[string, RegExp]> = [
      ['DROP TABLE', /\bDROP\s+TABLE\b/i],
      ['DROP COLUMN', /\bDROP\s+COLUMN\b/i],
      ['DROP CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
      ['DROP POLICY', /\bDROP\s+POLICY\b/i],
      ['DROP INDEX', /\bDROP\s+INDEX\b/i],
      ['DELETE FROM', /\bDELETE\s+FROM\b/i],
      ['TRUNCATE', /\bTRUNCATE\b/i],
      ['ALTER COLUMN ... TYPE', /ALTER\s+COLUMN\s+\w+\s+TYPE\b/i],
    ]
    for (const [label, re] of forbiddenPatterns) {
      expect({ label, hit: re.test(noComments) }).toEqual({ label, hit: false })
    }
  })

  it('creates only new tables (no ALTER COLUMN data type changes)', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf-8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.taller_certificados')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.taller_periodos_generales')
  })
})
