/**
 * POST /api/ninos/preregistro — public family pre-registration (N8 of
 * odd/tasks/ninos-checkin.md). No session: the form at /ninos/registro posts
 * here. The body is size-limited and parsed (lib/platform/ninos/preregistro),
 * a filled honeypot gets a silent ok, and the row is stored with the service
 * client through ninos_preregistro_crear (service_role only), which applies
 * the per-IP-hash rate limit. The answer never carries data back.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { LIMITES_PREREGISTRO } from '@/lib/platform/ninos/preregistro'
import { crearPreregistro, ipDeSolicitud } from '@/lib/platform/ninos/preregistro-servidor'

type Rpc = Parameters<typeof crearPreregistro>[0]['rpc']

export async function POST(req: NextRequest) {
  try {
    const crudo = await req.text()
    if (crudo.length > LIMITES_PREREGISTRO.cuerpo) {
      return NextResponse.json({ errores: ['El formulario es demasiado grande.'] }, { status: 413 })
    }
    let body: unknown
    try {
      body = JSON.parse(crudo)
    } catch {
      return NextResponse.json({ errores: ['Formulario inválido.'] }, { status: 400 })
    }

    const admin = createSupabaseAdminClient()
    const r = await crearPreregistro(
      {
        rpc: (admin.rpc as unknown as Rpc).bind(admin) as Rpc,
        sal: process.env.NINOS_PREREGISTRO_SAL ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'ninos-preregistro',
        hoy: hoyEnCaracas(),
      },
      body,
      ipDeSolicitud(req.headers),
    )
    return NextResponse.json(r.body, { status: r.status })
  } catch (error) {
    console.error('[ninos/preregistro] error:', error instanceof Error ? error.name : 'desconocido')
    return NextResponse.json({ errores: ['No pudimos guardar tu registro. Intenta de nuevo.'] }, { status: 500 })
  }
}
