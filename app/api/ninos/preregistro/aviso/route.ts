/**
 * POST /api/ninos/preregistro/aviso — "¿Vienen hoy?" (P4 of
 * odd/tasks/ninos-precheck.md). No session: right after sending the
 * pre-registration, the wizard at /ninos/registro posts { id, token, turnoId }
 * here. The row is stored with the service client through
 * ninos_preregistro_avisar (service_role only), which checks the token hash,
 * the service window and the per-IP-hash rate limit. The answer never carries
 * data back.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { avisarLlegada, ipDeSolicitud } from '@/lib/platform/ninos/preregistro-servidor'

type Rpc = Parameters<typeof avisarLlegada>[0]['rpc']

/** Bytes of the raw body: an id, a token and a turno id. */
const CUERPO_MAXIMO = 1_000

export async function POST(req: NextRequest) {
  try {
    const crudo = await req.text()
    if (crudo.length > CUERPO_MAXIMO) {
      return NextResponse.json({ errores: ['Aviso inválido.'] }, { status: 413 })
    }
    let body: unknown
    try {
      body = JSON.parse(crudo)
    } catch {
      return NextResponse.json({ errores: ['Aviso inválido.'] }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const r = await avisarLlegada(
      {
        rpc: (admin.rpc as unknown as Rpc).bind(admin) as Rpc,
        sal: process.env.NINOS_PREREGISTRO_SAL ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'ninos-preregistro',
      },
      body,
      ipDeSolicitud(req.headers),
    )
    return NextResponse.json(r.body, { status: r.status })
  } catch (error) {
    console.error('[ninos/preregistro/aviso] error:', error instanceof Error ? error.name : 'desconocido')
    return NextResponse.json({ errores: ['No pudimos avisar a la mesa. Intenta de nuevo o avísale al llegar.'] }, { status: 500 })
  }
}
