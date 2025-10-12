import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// POST /api/grupos/:id/restore -> restaurar desde papelera (eliminado=false, activo=true)
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const awaited = 'then' in ctx.params ? await ctx.params : ctx.params
    const { id } = awaited
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const roles = userData.roles || []
    const esAdmin = roles.some(r => ['admin','pastor','director-general'].includes(r))
    if (!esAdmin) return NextResponse.json({ error: 'Sólo administradores/pastor/director-general pueden restaurar' }, { status: 403 })

    const { error } = await supabase
      .from('grupos')
      .update({ eliminado: false, activo: true })
      .eq('id', id)
      .eq('eliminado', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, id, restored: true })
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
