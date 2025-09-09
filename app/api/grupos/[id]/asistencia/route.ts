import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { fecha, hora, tema, notas, asistencias } = body || {}
  if (!fecha) return NextResponse.json({ ok: false, error: 'Fecha requerida' }, { status: 400 })

  const { data, error } = await supabase.rpc('registrar_asistencia', {
    p_auth_id: user.id,
    p_grupo_id: id,
    p_fecha: fecha,
    p_hora: hora ?? null,
    p_tema: tema ?? null,
    p_notas: notas ?? null,
    p_asistencias: asistencias ?? null,
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, eventoId: data })
}
