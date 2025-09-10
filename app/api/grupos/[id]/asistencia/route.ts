import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { fecha, hora, tema, notas, asistencias } = body || {}
  if (!fecha) return NextResponse.json({ ok: false, error: 'Fecha requerida' }, { status: 400 })

  // Validación ligera del payload de asistencias (opcional)
  const safeAsistencias = Array.isArray(asistencias)
    ? asistencias.filter((a: any) => a && typeof a.usuario_id === 'string')
    : null

  const { data, error } = await supabase.rpc('registrar_asistencia', {
    p_auth_id: user.id,
    p_grupo_id: id,
    p_fecha: fecha,
    p_hora: hora ?? null,
    p_tema: tema ?? null,
    p_notas: notas ?? null,
    p_asistencias: safeAsistencias,
  })

  if (error) {
    console.error('registrar_asistencia error', {
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    })
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
  // (log éxito removido; se mantienen logs de error)
  return NextResponse.json({ ok: true, eventoId: data })
}
