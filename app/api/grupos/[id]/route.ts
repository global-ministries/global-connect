import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// DELETE /api/grupos/:id  -> mover a papelera (eliminado=true, activo=false)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const awaited = 'then' in ctx.params ? await ctx.params : ctx.params
    const { id } = awaited
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const roles = userData.roles || []
    const esSuperior = roles.some(r => ['admin','pastor','director-general','director-etapa'].includes(r))
    if (!esSuperior) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })

    // Papelera: marcar eliminado=true y activo=false (idempotente)
    const { error } = await supabase
      .from('grupos')
      .update({ eliminado: true, activo: false })
      .eq('id', id)
      .eq('eliminado', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id, deletedToTrash: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}
