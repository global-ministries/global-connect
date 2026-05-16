import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

const ROLES_SUPERIORES = ['admin', 'pastor', 'director-general']

// GET: lista de ubicaciones (crea si faltan las dos estándar)
export async function GET(_req: Request, { params }: { params: Promise<{ segmentoId: string }>}) {
  const { segmentoId } = await params
  if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido'}, { status: 400 })

  const supabaseServer = await createSupabaseServerClient()
  const userWithRoles = await getUserWithRoles(supabaseServer)
  if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const roles = userWithRoles.roles || []
  const esSuperior = roles.some((rol: string) => ROLES_SUPERIORES.includes(rol))
  if (!esSuperior) return NextResponse.json({ error: 'Permiso denegado', rolesActuales: roles }, { status: 403 })

  const supabaseAdmin = createSupabaseAdminClient()

  // Asegurar filas base (Barquisimeto, Cabudare) después de autenticar y autorizar.
  for (const nombre of ['Barquisimeto','Cabudare']) {
    const { error: upsertError } = await supabaseAdmin
      .from('segmento_ubicaciones')
      .upsert({ segmento_id: segmentoId, nombre }, { onConflict: 'segmento_id,nombre' })

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const { data, error } = await supabaseAdmin
    .from('segmento_ubicaciones')
    .select('id,nombre')
    .eq('segmento_id', segmentoId)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ubicaciones: data })
}
