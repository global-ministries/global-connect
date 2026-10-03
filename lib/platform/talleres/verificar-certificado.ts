/**
 * Public certificate lookup (UNAUTHENTICATED, server-only).
 *
 * Shared by the public verification page (`/verificar-certificado/[codigo]`)
 * and `GET /api/public/verificar-certificado/[codigo]`, so the page reads the
 * certificate in-process instead of fetching its own API over HTTP.
 *
 * The query always runs as `anon` with no session, even when the visitor is
 * signed in: RLS `taller_certificados_select_anon` (revocado_at IS NULL) and
 * the column-narrow anon GRANT alone decide what is visible. A cookie-bound
 * client would also match `taller_certificados_select_director`, which does
 * not hide revoked rows.
 *
 * Returns ONLY non-sensitive data, and the same `not-found` result for a
 * malformed, unknown, revoked, or failed lookup (no enumeration oracle).
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { isValidCertificateCode, type VerifiedCertificate } from '@/lib/platform/talleres/certificates'

const NON_SENSITIVE_COLUMNS =
  'id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot, fecha_completitud, firmantes_snapshot'

const NOT_FOUND: VerifiedCertificate = { valid: false, reason: 'not-found' }

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
export async function verifyPublicCertificate(codigo: string): Promise<VerifiedCertificate> {
  if (!isValidCertificateCode(codigo)) return NOT_FOUND

  const supabase = createSessionlessAnonClient()
  const { data, error } = await supabase
    .from('taller_certificados')
    .select(NON_SENSITIVE_COLUMNS)
    .eq('codigo_verificacion', codigo)
    .maybeSingle()

  if (error || !data) return NOT_FOUND

  const signers = Array.isArray(data.firmantes_snapshot)
    ? data.firmantes_snapshot.filter((signer): signer is string => typeof signer === 'string')
    : []

  return {
    valid: true,
    taller_title: data.nombre_taller_snapshot,
    participant_name: data.nombre_participante_snapshot,
    completion_date: data.fecha_completitud,
    signers,
  }
}
