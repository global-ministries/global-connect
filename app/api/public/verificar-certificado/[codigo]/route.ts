/**
 * PR10 — DT-039 — Public certificate verification API (UNAUTHENTICATED).
 *
 * GET /api/public/verificar-certificado/[codigo]
 *
 * Returns ONLY non-sensitive columns on success:
 *   { valid: true, taller_title, participant_name, completion_date, signers }
 *
 * Returns { valid: false, revoked, reason } on revoked / not-found, with
 * the SAME shape regardless of the underlying cause (no oracle / enumeration).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isValidCertificateCode } from '@/lib/platform/talleres/certificates'

interface RouteContext {
  readonly params: Promise<{ readonly codigo: string }>
}

const NON_SENSITIVE_COLUMNS =
  'id, codigo_verificacion, taller_id, persona_id, nombre_taller_snapshot, nombre_participante_snapshot, fecha_completitud, firmantes_snapshot'

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { codigo } = await ctx.params
  if (!isValidCertificateCode(codigo)) {
    return NextResponse.json({ valid: false, reason: 'not-found' }, { status: 404 })
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client; column-projected query
  const { data, error } = await (supabase as any)
    .from('taller_certificados')
    .select(NON_SENSITIVE_COLUMNS)
    .eq('codigo_verificacion', codigo)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ valid: false, reason: 'not-found' }, { status: 404 })
  }

  // Project firmantes_snapshot (jsonb) into string[].
  const signersArr = Array.isArray(data.firmantes_snapshot) ? data.firmantes_snapshot : []
  const signers: string[] = signersArr
    .filter((x: unknown) => typeof x === 'string')
    .map((x: unknown) => x as string)

  return NextResponse.json({
    valid: true,
    taller_title: data.nombre_taller_snapshot,
    participant_name: data.nombre_participante_snapshot,
    completion_date: data.fecha_completitud,
    signers,
  })
}
