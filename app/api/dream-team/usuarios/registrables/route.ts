/**
 * Dream Team — GET /api/dream-team/usuarios/registrables
 *
 * The equipos (with their active roles) the caller may register a NEW person
 * into, for the "Registrar persona nueva" form. Only the volunteer coordinator
 * of an area (an active Coordinador of an "Atención al Voluntario" equipo, for
 * the equipos under its parent), dream_team.org.manage, admin or pastor get any;
 * everyone else gets an empty list and the assigner hides the option.
 * dream_team_opciones_registro (SECURITY DEFINER, actor = auth.uid()) decides.
 *   200 { equipos: [{ id, etiqueta, roles: [{ id, label }] }] }
 */
import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDreamTeamEnabled, requireDreamTeamSession } from '@/lib/platform/dream-team/route-access'
import { mapOpcionesRegistro } from '@/lib/platform/dream-team/alta-persona'

export async function GET() {
  try {
    if (!isDreamTeamEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const session = await requireDreamTeamSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('dream_team_opciones_registro')
    if (error) {
      console.error('[dream-team/usuarios/registrables GET] error:', error)
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    return NextResponse.json({ equipos: mapOpcionesRegistro(data) })
  } catch (error) {
    console.error('[dream-team/usuarios/registrables GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
