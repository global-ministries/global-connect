/**
 * Dream Team — GET /api/dream-team/usuarios/posibles-duplicados
 *   ?nombre=&apellido=[&cedula=][&telefono=]
 *
 * «¿Es alguna de estas personas?» before «Registrar persona nueva» creates
 * someone (odd/tasks/dream-team-estructura-correcciones.md, T4, S6b). The
 * function personas_posibles_duplicados (SECURITY DEFINER, actor =
 * auth.uid()) authorizes like the cédula lookup (whoever may register people
 * somewhere; 42501 -> 403) and answers at most 10 people with the same
 * cédula, the same teléfono, or the first nombre and apellido among theirs:
 *   200 { personas: PosibleDuplicado[] }
 *   400 without nombre or apellido
 * Nothing is written and the form never blocks on it.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { mapRpcError } from '@/lib/platform/dream-team/alta-persona'
import {
  mapPosiblesDuplicados,
  parsePosiblesDuplicados,
  rpcArgsPosiblesDuplicados,
} from '@/lib/platform/personas/posibles-duplicados'

export async function GET(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const datos = parsePosiblesDuplicados(new URL(req.url).searchParams)
    if ('error' in datos) return NextResponse.json({ error: datos.error }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the RPC is newer than the generated types
    const client: any = supabase
    const { data, error } = await client.rpc('personas_posibles_duplicados', rpcArgsPosiblesDuplicados(datos))
    if (error) {
      const fallo = mapRpcError(error)
      if (fallo.status === 500) console.error('[dream-team/usuarios/posibles-duplicados GET] error:', error)
      return NextResponse.json({ error: fallo.error }, { status: fallo.status })
    }
    return NextResponse.json({ personas: mapPosiblesDuplicados(data) })
  } catch (error) {
    console.error('[dream-team/usuarios/posibles-duplicados GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
