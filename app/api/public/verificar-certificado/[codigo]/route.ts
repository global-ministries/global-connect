/**
 * PR10 — DT-039 — Public certificate verification API (UNAUTHENTICATED).
 *
 * GET /api/public/verificar-certificado/[codigo]
 *
 * Returns ONLY non-sensitive columns on success:
 *   { valid: true, taller_title, participant_name, partner_name,
 *     completion_date, signers }
 * `partner_name` (T2c, odd/tasks/talleres-cierre-de-edicion.md) is the
 * other person on a couple's certificate, null on an individual one.
 *
 * Returns { valid: false, reason: 'not-found' } with status 404 on a
 * malformed, unknown, revoked, or failed lookup — the SAME shape regardless
 * of the underlying cause (no oracle / enumeration).
 *
 * The lookup itself lives in lib/platform/talleres/verificar-certificado.ts,
 * shared with the public verification page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyPublicCertificate } from '@/lib/platform/talleres/verificar-certificado'

interface RouteContext {
  readonly params: Promise<{ readonly codigo: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { codigo } = await ctx.params
  const result = await verifyPublicCertificate(codigo)

  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: 'not-found' }, { status: 404 })
  }

  return NextResponse.json({
    valid: true,
    taller_title: result.taller_title,
    participant_name: result.participant_name,
    partner_name: result.partner_name,
    completion_date: result.completion_date,
    signers: result.signers,
  })
}
