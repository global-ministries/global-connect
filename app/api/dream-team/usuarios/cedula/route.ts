/**
 * Dream Team — GET /api/dream-team/usuarios/cedula?cedula=...
 *
 * One person by normalized cedula, for the optional representative picker of
 * the "Registrar persona nueva" form (T9). Exact match only, through the
 * dream_team_persona_por_cedula function (SECURITY DEFINER, actor =
 * auth.uid(), refuses anyone who may not register people; 42501 -> 403).
 *   200 { persona: { id, nombre, apellido } | null }
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { mapRpcError } from '@/lib/platform/dream-team/alta-persona'
import { prepararCedula } from '@/lib/utils/cedula'

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const cedula = prepararCedula(new URL(req.url).searchParams.get('cedula'))
    if (!cedula) return NextResponse.json({ persona: null })

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('dream_team_persona_por_cedula', { p_cedula: cedula })
    if (error) {
      const fallo = mapRpcError(error)
      if (fallo.status === 500) console.error('[dream-team/usuarios/cedula GET] error:', error)
      return NextResponse.json({ error: fallo.error }, { status: fallo.status })
    }
    const persona = (data ?? [])[0] ?? null
    return NextResponse.json({ persona })
  } catch (error) {
    console.error('[dream-team/usuarios/cedula GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
