import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// GET: lista ciudades asignadas por director (vista) y todas las ciudades del segmento
export async function GET(_req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params
    const { segmentoId } = awaitedParams
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido'}, { status: 400 })
    const supabaseAdmin = createSupabaseAdminClient()
    const { data: ciudades, error: eC } = await supabaseAdmin.from('segmento_ubicaciones').select('id,nombre').eq('segmento_id', segmentoId)
    if (eC) return NextResponse.json({ error: eC.message }, { status: 500 })
    const { data: directores, error: eD } = await supabaseAdmin.from('v_directores_etapa_segmento').select('*').eq('segmento_id', segmentoId)
    if (eD) return NextResponse.json({ error: eD.message }, { status: 500 })
    return NextResponse.json({ ciudades, directores })
  } catch (e: any) {
    console.error('[ubicaciones GET] Exception', e)
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// POST: toggle (agregar/quitar) ciudad para un director
export async function POST(req: Request, context: { params: Promise<{ segmentoId: string }> | { segmentoId: string } }) {
  try {
    const awaitedParams = 'then' in context.params ? await context.params : context.params
    const { segmentoId } = awaitedParams
    if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido'}, { status: 400 })

  const supabaseServer = await createSupabaseServerClient() // para auth user
  const supabaseAdmin = createSupabaseAdminClient() // bypass RLS
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: 'No autenticado'}, { status: 401 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido'}, { status: 400 }) }
    const { director_etapa_segmento_lider_id, segmento_ubicacion_id, accion } = body || {}
    if (!director_etapa_segmento_lider_id || !segmento_ubicacion_id || !accion) {
      return NextResponse.json({ error: 'Parámetros insuficientes'}, { status: 400 })
    }
    if (!['agregar','quitar'].includes(accion)) {
      return NextResponse.json({ error: 'accion debe ser agregar|quitar' }, { status: 400 })
    }

    // Validar roles superiores usando helper centralizado
    const userWithRoles = await getUserWithRoles(supabaseServer)
    if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const rolesList = userWithRoles.roles || []
    const esSuperior = rolesList.some((r: string) => ['admin','pastor','director-general'].includes(r))
    if (!esSuperior) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })

    // Validar que el id corresponde a un director_etapa del segmento
    const { data: dirRow, error: dirErr } = await supabaseAdmin
      .from('segmento_lideres')
      .select('id, segmento_id, tipo_lider')
      .eq('id', director_etapa_segmento_lider_id)
      .single()
    if (dirErr || !dirRow) return NextResponse.json({ error: 'Director no encontrado' }, { status: 404 })
    if (dirRow.segmento_id !== segmentoId) return NextResponse.json({ error: 'No pertenece al segmento' }, { status: 400 })
    if (dirRow.tipo_lider !== 'director_etapa') return NextResponse.json({ error: 'Registro no es director_etapa' }, { status: 400 })

    let resultRow: any = null
    if (accion === 'agregar') {
      const { error: upErr } = await supabaseAdmin
        .from('director_etapa_ubicaciones')
        .upsert({ director_etapa_id: director_etapa_segmento_lider_id, segmento_ubicacion_id }, { onConflict: 'director_etapa_id' })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
      const { data: selRow } = await supabaseAdmin
        .from('director_etapa_ubicaciones')
        .select('id,director_etapa_id,segmento_ubicacion_id')
        .eq('director_etapa_id', director_etapa_segmento_lider_id)
        .single()
      resultRow = selRow
    } else if (accion === 'quitar') {
      const { error: delErr } = await supabaseAdmin
        .from('director_etapa_ubicaciones')
        .delete()
        .eq('director_etapa_id', director_etapa_segmento_lider_id)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true, asignaciones: resultRow ? [resultRow] : [] })
  } catch (e: any) {
    console.error('[ubicaciones POST] Exception', e)
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
