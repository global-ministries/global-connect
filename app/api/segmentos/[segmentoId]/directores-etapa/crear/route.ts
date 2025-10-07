import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

export async function POST(req: Request, { params }: { params: Promise<{ segmentoId: string }>}) {
  const { segmentoId } = await params
  if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 })
  const supabase = await createSupabaseServerClient()
  const supabaseAdmin = createSupabaseAdminClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = userData.user
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const { usuario_id, segmento_ubicacion_id } = body || {}
  if (!usuario_id) return NextResponse.json({ error: 'usuario_id requerido' }, { status: 400 })

  // Validar roles (roles ya vienen normalizados de getUserWithRoles)
  const roles = userData.roles || []
  const superior = roles.some(r => ['admin','pastor','director-general'].includes(r))
  if (!superior) {
    return NextResponse.json({ error: 'Permiso denegado', rolesActuales: roles }, { status: 403 })
  }

  // Verificar que no exista ya
  const { data: exists, error: exErr } = await supabase
    .from('segmento_lideres')
    .select('id')
    .eq('segmento_id', segmentoId)
    .eq('usuario_id', usuario_id)
    .eq('tipo_lider','director_etapa')
    .limit(1)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  if (exists && exists.length) return NextResponse.json({ error: 'Ya es director en este segmento' }, { status: 409 })

  // Insert usando admin para evitar bloqueo RLS (ya validamos roles manualmente)
  const { data: insertData, error: insErr } = await supabaseAdmin
    .from('segmento_lideres')
    .insert({ segmento_id: segmentoId, usuario_id, tipo_lider: 'director_etapa' })
    .select('id')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
  let ciudadAsignada: string | null = null
  if (segmento_ubicacion_id) {
    // Reemplaza RPC por upsert directo (evita ambigüedad de función)
    try {
      const { error: upErr } = await supabaseAdmin
        .from('director_etapa_ubicaciones')
        .upsert({ director_etapa_id: insertData.id, segmento_ubicacion_id }, { onConflict: 'director_etapa_id' })
      if (upErr) {
        return NextResponse.json({ ok: true, id: insertData.id, ciudadError: upErr.message })
      }
      ciudadAsignada = segmento_ubicacion_id
    } catch (e: any) {
      return NextResponse.json({ ok: true, id: insertData.id, ciudadError: e.message || 'Fallo asignando ciudad' })
    }
  }

  return NextResponse.json({ ok: true, id: insertData.id, ciudadAsignada })
}
