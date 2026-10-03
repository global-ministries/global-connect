/**
 * Public certificate lookup (UNAUTHENTICATED, server-only).
 *
 * Shared by the public verification page (`/verificar-certificado/[codigo]`)
 * and `GET /api/public/verificar-certificado/[codigo]`, so the page reads the
 * certificate in-process instead of fetching its own API over HTTP.
 *
 * The lookup always runs as `anon` with no session, even when the visitor is
 * signed in, and goes through the SECURITY DEFINER RPC
 * `verificar_certificado_publico(p_codigo)` (migration 20261003170000): it
 * returns at most the one non-revoked certificate with that exact code, with
 * only the columns below. anon holds no privilege on taller_certificados, so
 * nobody can list certificates without knowing a code.
 *
 * Returns ONLY non-sensitive data, and the same `not-found` result for a
 * malformed, unknown, revoked, or failed lookup (no enumeration oracle).
 *
 * T2c (odd/tasks/talleres-cierre-de-edicion.md): each person of a couple
 * gets their own certificate, naming the partner in nombre_pareja_snapshot
 * (returned by the RPC like the other snapshot columns). It surfaces as
 * `partner_name`, null on an individual certificate.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { isValidCertificateCode, type VerifiedCertificate } from '@/lib/platform/talleres/certificates'

/** VerifiedCertificate plus the partner on a couple's certificate (null otherwise). */
export type PublicCertificateVerification =
  | (Extract<VerifiedCertificate, { valid: true }> & { readonly partner_name: string | null })
  | Extract<VerifiedCertificate, { valid: false }>

const NOT_FOUND: PublicCertificateVerification = { valid: false, reason: 'not-found' }

function createSessionlessAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      // Never serve a cached lookup: a revocation must show up immediately.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    }
  )
}

/**
 * Looks a certificate up by its public verification code. Malformed codes
 * are rejected before any query. Client construction errors (e.g. missing
 * Supabase env vars) propagate so each caller keeps its own failure mode.
 */
export async function verifyPublicCertificate(codigo: string): Promise<PublicCertificateVerification> {
  if (!isValidCertificateCode(codigo)) return NOT_FOUND

  const supabase = createSessionlessAnonClient()
  const { data: rows, error } = await supabase.rpc('verificar_certificado_publico', { p_codigo: codigo })
  const data = Array.isArray(rows) ? rows[0] : undefined

  if (error || !data) return NOT_FOUND

  const signers = Array.isArray(data.firmantes_snapshot)
    ? data.firmantes_snapshot.filter((signer): signer is string => typeof signer === 'string')
    : []

  return {
    valid: true,
    taller_title: data.nombre_taller_snapshot,
    participant_name: data.nombre_participante_snapshot,
    partner_name: data.nombre_pareja_snapshot ?? null,
    completion_date: data.fecha_completitud,
    signers,
  }
}
