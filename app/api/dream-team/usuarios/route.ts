/**
 * Dream Team — POST /api/dream-team/usuarios
 *
 * Registers a person who is not in the system yet and assigns them a servicio
 * in the same step (T7/T9 of odd/tasks/ninos-voluntarios-waumba.md). The
 * database function dream_team_registrar_persona does it in one transaction,
 * authorizes the actor (auth.uid()) against the target equipo (only the
 * volunteer coordinator of the area, dream_team.org.manage, admin or pastor;
 * 20261006110100) and never duplicates a person. There is no capability gate
 * here: the coordinator's only grant is dream_team.coordinate, so the function
 * is the one authority (42501 -> 403):
 *   201 { resultado: 'creada', personaId, nombre, servicioId }
 *   200 { resultado: 'existente', personaId, nombre }      cedula already held
 *   200 { resultado: 'coincidencias', candidatos }         same name + birth date
 * The campus is the actor's selected one (the gc_campus_activo cookie, checked
 * by the function) or, without it, their principal campus.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import {
  CAMPUS_COOKIE,
  esUuid,
  mapResultado,
  mapRpcError,
  parseAltaPersona,
  rpcArgs,
} from '@/lib/platform/dream-team/alta-persona'

export async function POST(req: NextRequest) {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const input = parseAltaPersona(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const cookie = req.cookies.get(CAMPUS_COOKIE)?.value
    const campusId = esUuid(cookie) ? cookie : null

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('dream_team_registrar_persona', rpcArgs(input, campusId))
    if (error) {
      const fallo = mapRpcError(error)
      if (fallo.status === 500) console.error('[dream-team/usuarios POST] error:', error)
      return NextResponse.json({ error: fallo.error }, { status: fallo.status })
    }

    const resultado = mapResultado(data)
    return NextResponse.json(resultado, { status: resultado.resultado === 'creada' ? 201 : 200 })
  } catch (error) {
    console.error('[dream-team/usuarios POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
